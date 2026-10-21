import type { ClientRateLimitInfo, Options, Store } from "express-rate-limit";

import { redis } from "./index.js";

// INCR + set the window's expiry on the first hit, atomically, so two API
// instances (or two requests racing) can't both start a fresh window.
const INCREMENT_SCRIPT = `
local hits = redis.call('INCR', KEYS[1])
local ttl = redis.call('PTTL', KEYS[1])
if ttl < 0 then
    redis.call('PEXPIRE', KEYS[1], ARGV[1])
    ttl = tonumber(ARGV[1])
end
return { hits, ttl }
`;

/**
 * Fixed-window rate-limit counters in Redis, shared by every API process
 * and kept across restarts (an in-memory store resets on every deploy).
 * One instance per limiter; `name` keeps their keys apart.
 */
export class RedisRateLimitStore implements Store {
    private windowMs = 60_000;
    private readonly keyPrefix: string;

    constructor(name: string) {
        this.keyPrefix = `rl:${name}:`;
    }

    init(options: Options) {
        this.windowMs = options.windowMs;
    }

    async get(key: string): Promise<ClientRateLimitInfo | undefined> {
        const [hits, ttl] = await Promise.all([
            redis.get(this.keyPrefix + key),
            redis.pTTL(this.keyPrefix + key),
        ]);
        if (hits === null) return undefined;
        return { totalHits: Number(hits), resetTime: new Date(Date.now() + Math.max(ttl, 0)) };
    }

    async increment(key: string): Promise<ClientRateLimitInfo> {
        const [hits, ttl] = await redis.eval(INCREMENT_SCRIPT, {
            keys: [this.keyPrefix + key],
            arguments: [String(this.windowMs)],
        }) as [number, number];
        return { totalHits: Number(hits), resetTime: new Date(Date.now() + Number(ttl)) };
    }

    async decrement(key: string) {
        await redis.decr(this.keyPrefix + key);
    }

    async resetKey(key: string) {
        await redis.del(this.keyPrefix + key);
    }
}
