# Load tester

Simulates Gym Ledger's users against the API, from a machine of its own, and shows every run in a
local dashboard. It is a separate package (no code shared with the API at runtime) so the load
VPS only needs this folder.

What it simulates, through the same requests the web app makes:

- **A population, not a request loop.** N seeded accounts; a share open the app each day
  (`dailyActiveShare`, `visitsPerActiveUser`), on a gym-shaped daily curve (morning and evening
  peaks) and weekday pattern, in your timezone. Usage is skewed like real apps: a few regulars,
  many occasional users.
- **Visits with a purpose.** Each app open loads Home (all its cards, in parallel) with the
  notification stream (SSE) held open, then: a workout (today's plan session, set by set with
  rests; ~45 min; sets synced like the app's queue, sometimes offline and batched; sometimes
  abandoned), a quick check, a weigh-in, progress and history, browsing plans and exercises, or
  settings. New users go through privacy acceptance, onboarding and picking a plan.
- **Real sign-in behaviour.** Most opens come from a remembered device (token refresh); the rest
  type a password, and ~8% of typed passwords are wrong (typo, caps lock, old password), retried
  like a person would. Access tokens expire mid-workout and are refreshed.
- **Bots.** Credential stuffing against the login from rotating IPs (unknown emails, wrong
  passwords): you should see 401s turn into 429s per IP, and *Got in* stay at 0.
- **Nothing paid by default.** Load-test users are opted out of AI check-ins (no Groq calls) and
  never trigger OTP emails, unless `paid.*` says so.

## How failed logins were sized

There is no authoritative "normal" failure rate; published figures range from a few percent to
over a quarter of first attempts depending on what is counted. The defaults are deliberately
middle-of-the-road and easy to change:

| setting | default | meaning |
|---|---|---|
| `logins.typoRate` | 0.08 | wrong first password (typos, caps lock, an old password) |
| `logins.repeatTypoRate` | 0.25 | wrong again after a typo |
| `population.rememberedDeviceShare` | 0.9 | opens that need no password at all |
| `attacks.credentialStuffing.attemptsPerHour` | 30 | bot attempts per hour (×`load.multiplier`), mostly unknown emails |

Typed passwords are only ~10% of opens, so human failures stay a small share of login traffic;
bot traffic, which on a public login usually outnumbers humans, is configured on its own. Once you
have production logs, set these from your own ratio of `401`s to `200`s on
`POST /auth/login/password`.

## One-time setup (against the API)

1. On the **API** server, add to its `.env`:
   ```
   LOAD_TEST_SECRET=<openssl rand -hex 32>
   LOAD_TEST_SOURCE_IPS=<the load VPS's public IP>   # recommended: only it may use the secret
   LOAD_USER_PASSWORD=<a long password>
   ```
   and restart the API. With the secret, each simulated user is rate-limited by its own
   (simulated) IP instead of everyone sharing the VPS's, so the limiters are tested as real
   users meet them. Remove the secret when you're done testing.
2. Seed the accounts (in the API container: `node dist/scripts/seed-load-users.js --count 5000`;
   locally `npm run seed:load-users -- --count 5000`). They are `lt-000001@loadtest.invalid` …,
   all with `LOAD_USER_PASSWORD`. Use at least as many as the largest `users.count` you'll run.
3. Make sure there are published public workout plans (workouts need one to pick).
4. When you're done for good: `seed-load-users.js --purge` deletes every load-test account and
   everything it wrote, without counting it in the anonymous training totals.

> These accounts are real rows in production. Until they're purged they show up in the admin
> panel's user and activity numbers; filter `@loadtest.invalid` when reading those.

**Nobody else can use them in production.** The emails and how they're made are public (this repo
is open source), so in production every auth path refuses a `@loadtest.invalid` account unless
the request carries the load tester's `LOAD_TEST_SECRET` (from an allowed IP, if
`LOAD_TEST_SOURCE_IPS` is set): password login and the code endpoints answer exactly as for a
wrong password or a code never sent (no email goes out), refresh and reset tokens are refused, and
any signed-in request (change password, deletion codes, everything) gets a 401. With the secret
unset they're locked entirely. Outside production they work normally, so you can sign in as one
locally for manual testing.

## On the load VPS (Docker, recommended)

Docker over pm2 here: the image pins Node, `restart: unless-stopped` brings it back after a
reboot with no `pm2 startup` step, the dashboard port is bound to localhost by Compose, file
limits and log rotation are set in one file, and a second generator is one command.

```bash
git clone … && cd workout-gym-api/load-tester
cp .env.example .env            # LOAD_USER_PASSWORD, LOAD_TEST_SECRET, LOAD_CONFIG
nano configs/soak-forever.json  # set target.apiUrl (and users.count)

docker compose build
docker compose run --rm generator plan --config configs/soak-forever.json   # ✓ checks
docker compose run --rm generator prepare --config configs/soak-forever.json # optional: onboard everyone first
docker compose up -d            # generator (LOAD_CONFIG) + dashboard
docker compose logs -f generator
```

Then on your laptop: `ssh -N -L 8099:127.0.0.1:8099 you@vps` and open <http://localhost:8099>.

- **Another config at the same time** (a spike on top of the soak):
  `docker compose run -d --name spike generator run --config configs/spike.json`
- **Stop**: `docker compose stop generator` (writes the final state). An unfinished run of the
  same config **resumes** on the next start (reboots included), keeping its numbers and its
  users' remembered devices; change anything that shapes the load, or pass `--new`, to start a
  fresh run.
- Runs live in the `runs` volume; each is a folder of plain JSON/NDJSON
  (`docker compose cp generator:/app/runs ./runs` to copy them out).

### pm2 instead

```bash
npm ci && npm run build
cp .env.example .env
pm2 start ecosystem.config.cjs && pm2 save && pm2 startup
```

## Configs

`configs/` has worked examples; every setting is optional except `target.apiUrl`, and
`src/config.ts` documents each one. Unknown keys are errors, so typos don't silently do nothing.

| file | what |
|---|---|
| `smoke.json` | 5 quiet minutes: does everything work? |
| `typical-day.json` | 24 h of 2,000 users on the daily curve |
| `peak-hour.json` | the busiest hour of 10,000 users, held for an hour |
| `spike.json` | normal → 8× for 5 min → normal: does it recover? |
| `breakpoint.json` | steps up every 5 min until p95/errors cross the limit, then stops |
| `soak-forever.json` | runs until stopped (days, weeks), resumes after restarts |

Useful knobs: `load.multiplier` (scale everything), `load.stages` (ramps/spikes, k6-style),
`load.clockSpeed` (24 = a whole day's curve in an hour), `thresholds` (`abortOnBreach` for
breakpoint tests).

`plan` prints the expected volume (opens per day, people in the app at the peak, req/s) and
checks the API, the seeded password and that the load-test key is honoured.

## The dashboard

Runs list → a run: live KPIs, requests by outcome, latency (p50/p95/p99 against your threshold),
people in the app by what they're doing, error rate, the arrival rate the schedule wants, the
generator's own health (if its event loop lags, the generator is the bottleneck, not the API),
what people did (logins, typos, workouts, sets, bots blocked), every endpoint with exact
percentiles for any range (click one for its own charts), and the event log. Ranges from 15
minutes to the whole run; a weeks-long run stays fast (hourly rollups).

## Developing

```bash
npm install
npm run load -- plan --config configs/smoke.json
npm run load -- run  --config configs/smoke.json
npm run ui -- --dir runs
npm test
```
