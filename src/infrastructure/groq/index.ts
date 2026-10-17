import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { redis } from "../redis/index.js";

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
 * structured outputs). Returns the parsed JSON; the caller still validates it.
 */
export const generateStructuredJson = async (params: {
    system: string,
    user: string,
    schemaName: string,
    schema: Record<string, unknown>,
    maxTokens?: number,
}): Promise<{ data: unknown, model: string }> => {
    if (!env.GROQ_API_KEY) {
        throw new LlmUnavailableError("not_configured", "GROQ_API_KEY is not set");
    }
    await reserveDailyRequest();

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
        if (error instanceof DOMException && (error.name === "TimeoutError" || error.name === "AbortError")) {
            throw new LlmUnavailableError("timeout", "Model request timed out");
        }
        throw new LlmUnavailableError("provider_error", "Could not reach the model provider");
    }

    if (!res.ok) {
        // The body can echo request details; log it here, never return it.
        const body = await res.text().catch(() => "");
        logger.warn({ status: res.status, body: body.slice(0, 500) }, "Groq request failed");
        throw new LlmUnavailableError(
            res.status === 429 ? "rate_limited" : "provider_error",
            `Model provider returned ${res.status}`,
        );
    }

    const json = await res.json() as {
        model?: string,
        choices?: { message?: { content?: string | null }, finish_reason?: string }[],
    };
    const content = json.choices?.[0]?.message?.content;
    if (!content) {
        throw new LlmUnavailableError("bad_output", `Model returned no content (${json.choices?.[0]?.finish_reason ?? "unknown"})`);
    }
    try {
        return { data: JSON.parse(content), model: json.model ?? env.GROQ_MODEL };
    } catch {
        throw new LlmUnavailableError("bad_output", "Model returned invalid JSON");
    }
}
