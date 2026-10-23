// Credential stuffing: bots replaying leaked email/password lists against the login, from
// rotating IPs. Any public login page sees this all day; the API should shrug it off (401s,
// then 429s per IP) without real users noticing. Recorded under their own endpoint key.
import type { Config } from "./config.js";
import { request } from "./http.js";
import { background, chance, counters, sleep, stopping } from "./runtime.js";
import { poisson } from "./schedule.js";
import { leakedEmail, someEmail } from "./users.js";

const KEY = "POST /auth/login/password · bot";

export function startCredentialStuffing(c: Config, multiplier: () => number): void {
    const s = c.attacks.credentialStuffing;
    if (s.attemptsPerHour <= 0) return;
    let botIp = "";
    let usesLeft = 0;
    const nextIp = () => `198.18.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 254) + 1}`; // RFC 2544 test range
    background((async () => {
        const tickMs = 1000;
        while (!stopping()) {
            await sleep(tickMs);
            const n = poisson((s.attemptsPerHour * multiplier() * tickMs) / 3_600_000);
            for (let i = 0; i < n; i++) {
                if (usesLeft <= 0) {
                    botIp = nextIp();
                    usesLeft = s.attemptsPerIp;
                }
                usesLeft--;
                const email = chance(s.existingAccountShare) ? someEmail(c) : leakedEmail();
                const password = Math.random().toString(36).slice(2, 12);
                counters.botAttempts++;
                void request({ ip: botIp }, KEY, "POST", "/auth/login/password", {
                    body: { method: "email", email, password },
                    expect: [400, 401],
                }).then((r) => {
                    if (r.status === 429) counters.botBlocked++;
                    else if (r.status === 200) counters.botSuccesses++;
                });
            }
        }
    })());
}
