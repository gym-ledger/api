import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { redis } from "../redis/index.js";
import { AiRequestLogEntry, logAiRequest } from "./aiRequestLog.js";

const GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions";

// The web app gives up on a request after 20s and the check-in is generated
// inside one, so the model call has to finish well before that.
const REQUEST_TIMEOUT_MS = 15_000;

/**
 * The model call could not be made or did not return usable output. Callers
 * treat this as "try again later", never as a request error for the user.
 */
export class LlmUnavailableError extends Error {
    constructor(
        public readonly reason: "not_configured" | "daily_limit" | "rate_limited" | "timeout" | "provider_error" | "bad_output",
        message: string,
    ) {
        super(message);
        this.name = "LlmUnavailableError";
    }
}

export const isLlmConfigured = (): boolean => Boolean(env.GROQ_API_KEY);

/**
 * Counts one model call against today's (UTC) budget. Redis is shared by
 * every API process, so the cap holds across instances.
 */
const reserveDailyRequest = async (): Promise<void> => {
    const key = `groq:requests:${new Date().toISOString().slice(0, 10)}`;
    const count = await redis.incr(key);
    if (count === 1) {
        await redis.expire(key, 60 * 60 * 48);
    }
    if (count > env.GROQ_DAILY_REQUEST_LIMIT) {
        throw new LlmUnavailableError("daily_limit", "Daily model request budget used up");
    }
}

/**
 * One chat completion whose reply is constrained to `schema` (Groq strict
 * structured outputs). `validate` checks the parsed JSON and returns the
 * typed value, or null to reject it as bad output.
 *
 * Every attempt is recorded in `ai_requests` (metadata only, never the
 * prompt or reply) under `feature` and `userId`.
 */
export const generateStructuredJson = async <T>(params: {
    system: string,
    user: string,
    schemaName: string,
    schema: Record<string, unknown>,
    maxTokens?: number,
    feature: string,
    userId?: string | null,
    validate: (data: unknown) => T | null,
}): Promise<{ data: T, model: string }> => {
    const log: Omit<AiRequestLogEntry, "status"> = {
        userId: params.userId ?? null,
        feature: params.feature,
        model: env.GROQ_MODEL,
        promptTokens: null,
        completionTokens: null,
        latencyMs: null,
    };
    try {
        const result = await callModel(params, log);
        logAiRequest({ ...log, status: "success" });
        return result;
    } catch (error) {
        // Anything else (e.g. Redis down while reserving the budget) means
        // the call was never attempted, so there is nothing to record.
        if (error instanceof LlmUnavailableError) {
            logAiRequest({ ...log, status: error.reason });
        }
        throw error;
    }
}

/** Fills `log` (model, tokens, latency) as it learns them. */
const callModel = async <T>(
    params: Parameters<typeof generateStructuredJson<T>>[0],
    log: Omit<AiRequestLogEntry, "status">,
): Promise<{ data: T, model: string }> => {
    if (!env.GROQ_API_KEY) {
        throw new LlmUnavailableError("not_configured", "GROQ_API_KEY is not set");
    }
    await reserveDailyRequest();

    const startedAt = performance.now();
    const elapsed = () => Math.round(performance.now() - startedAt);
    let res: Response;
    try {
        res = await fetch(GROQ_CHAT_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${env.GROQ_API_KEY}`,
            },
            body: JSON.stringify({
                model: env.GROQ_MODEL,
                messages: [
                    { role: "system", content: params.system },
                    { role: "user", content: params.user },
                ],
                temperature: 0.4,
                max_completion_tokens: params.maxTokens ?? 1200,
                // gpt-oss models think before answering; a short think is
                // plenty for summarising precomputed numbers, and the
                // reasoning text itself is never shown.
                reasoning_effort: "low",
                include_reasoning: false,
                response_format: {
                    type: "json_schema",
                    json_schema: {
                        name: params.schemaName,
                        strict: true,
                        schema: params.schema,
                    },
                },
            }),
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
    } catch (error) {
        log.latencyMs = elapsed();
        if (error instanceof DOMException && (error.name === "TimeoutError" || error.name === "AbortError")) {
            throw new LlmUnavailableError("timeout", "Model request timed out");
        }
        throw new LlmUnavailableError("provider_error", "Could not reach the model provider");
    }

    if (!res.ok) {
        log.latencyMs = elapsed();
        // The body can echo request details; log it here, never return it.
        const body = await res.text().catch(() => "");
        logger.warn({ status: res.status, body: body.slice(0, 500) }, "Groq request failed");
        throw new LlmUnavailableError(
            res.status === 429 ? "rate_limited" : "provider_error",
            `Model provider returned ${res.status}`,
        );
    }

    let json: {
        model?: string,
        choices?: { message?: { content?: string | null }, finish_reason?: string }[],
        usage?: { prompt_tokens?: number, completion_tokens?: number },
    };
    try {
        json = await res.json() as typeof json;
    } catch {
        log.latencyMs = elapsed();
        throw new LlmUnavailableError("bad_output", "Model provider returned a non-JSON body");
    }
    log.latencyMs = elapsed();
    log.model = json.model ?? env.GROQ_MODEL;
    log.promptTokens = json.usage?.prompt_tokens ?? null;
    log.completionTokens = json.usage?.completion_tokens ?? null;

    const content = json.choices?.[0]?.message?.content;
    if (!content) {
        throw new LlmUnavailableError("bad_output", `Model returned no content (${json.choices?.[0]?.finish_reason ?? "unknown"})`);
    }
    let parsed: unknown;
    try {
        parsed = JSON.parse(content);
    } catch {
        throw new LlmUnavailableError("bad_output", "Model returned invalid JSON");
    }
    const data = params.validate(parsed);
    if (data === null) {
        throw new LlmUnavailableError("bad_output", "Model output failed validation");
    }
    return { data, model: log.model };
}
