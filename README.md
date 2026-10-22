# gym-ledger/api

The REST API behind Gym Ledger, a self-hostable workout logger. Both front-ends talk only to this API: [`gym-ledger/web`](https://github.com/gym-ledger/web) (the app people train with) and [`gym-ledger/admin`](https://github.com/gym-ledger/admin) (the admin panel). Screenshots of both are in their READMEs.

## What it does

- **Accounts and sign-in.** One-time codes by email ([Resend](https://resend.com)) or WhatsApp ([Twilio](https://www.twilio.com), optional), optional passwords, a self-hosted proof-of-work CAPTCHA (ALTCHA) on "send code", and one session per device with refresh tokens in httpOnly cookies.
- **Workouts.** Plans and their versions, users' own editable copies, workout sessions, sets with warm-ups and drop sets, a batch endpoint for sets logged offline, personal records, weekly volume and per-muscle training signals.
- **Body weight.** Entries, moving averages, CSV import, and weight goals kept as history.
- **Weekly check-ins.** Each finished week's numbers, plus an optional AI note from [Groq](https://console.groq.com) for users who opt in. Exactly what is sent is fixed in code and listed in the web app's privacy policy.
- **Your data.** Data exports built in the background (a JSON file of everything stored about the user, downloadable for 7 days, with a notification when ready) and account deletion: every session ends at once, and 30 days later everything about the user is deleted, after their training is folded into anonymous monthly per-exercise totals (`analytics_exercise_monthly`).
- **Admin.** CRUD for exercises (with images on S3-compatible storage), muscles, plans and progression rules, CSV import/export, user and AI-usage analytics, and an audit log of every admin change.

## Security

- Every route checks its params, query and body against a strict [zod](https://zod.dev) schema (`src/middleware/validate.ts` and a `*.schemas.ts` file per module): unknown fields are rejected, sizes and counts are capped.
- Access tokens are short-lived and only valid while their session (device) is active, so signing out or changing a password takes effect at once. Refresh tokens rotate on every use; an old one that comes back after a 60-second grace window ends the session.
- OTPs and passwords are hashed with argon2, tokens with SHA-256; rate limits live in Redis; CORS is limited to the configured front-end origins.
- The production containers run as an unprivileged user and contain no dev dependencies.

Found a problem? Please report it privately: see [SECURITY.md](SECURITY.md).

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 22 · TypeScript · ESM |
| Framework | Express 5 |
| Database | PostgreSQL 16 |
| Cache | Redis 7 |
| Auth | JOSE (JWT) · Argon2 |
| Validation | Zod |
| Logging | Pino |
| Deployment | Docker · Docker Compose |

## Run the whole stack

One command starts PostgreSQL, Redis, this API, the [user app](../web) and the [admin panel](../admin) on your machine, with the exercise library already loaded.

**You need:** Docker with Compose v2, and the three repos cloned side by side:

```
some-folder/
├── api/
├── web/
└── admin/
```

**Start it** from `api/`:

```bash
docker compose -f stack/docker-compose.yml up --build
```

The first build takes a few minutes. When the logs settle, open:

| What | URL | Sign in with |
|---|---|---|
| User app | http://localhost:3000 | Any email. The 6-digit code is printed in the API log (see below) |
| Admin panel | http://localhost:3001 | `admin@example.com` / `local-admin-password` |
| API | http://localhost:4000/api/v1 | `GET /health` returns 200 with `"ok": true` when Postgres and Redis both answer, 503 otherwise |

**Getting your login code.** No email provider is set up locally, so the API prints each code instead:

```bash
docker compose -f stack/docker-compose.yml logs api | grep -A3 "OTP issued"
```

The same code that logs you in creates your account the first time.

**What happens on start.** Every time the API container starts, it runs any pending migrations, creates the first admin if there is none, and loads the exercise library from `seeds/exercises.json`. The library load only adds exercises and muscles whose slug has never existed, so it never overwrites or brings back anything an admin changed or deleted.

**Options.** Set any of these in your shell or in `stack/.env` before `up`:

| Variable | Default | What it does |
|---|---|---|
| `API_PORT`, `APP_PORT`, `ADMIN_PORT` | `4000`, `3000`, `3001` | Host ports, if those are taken |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | `admin@example.com`, `local-admin-password` | First admin (only used when no admin exists yet) |
| `RESEND_API_KEY`, `EMAIL_FROM` | unset | Send real login emails through [Resend](https://resend.com) |
| `GROQ_API_KEY` | unset | Write AI notes in weekly check-ins ([Groq](https://console.groq.com)) |

**Monitoring.** Add `--profile monitoring` to `up` to also start Prometheus (http://localhost:9090) and Grafana (http://localhost:3002, `admin` / `local-grafana-password`). See [Monitoring](deployment/monitoring/MONITORING.md).

**Stop it** with `Ctrl+C`, or `docker compose -f stack/docker-compose.yml down`. Add `-v` to also delete the database.

This setup is for trying the project and for development only: it runs with `NODE_ENV=development`, fixed secrets and plain http. To run it on a server, use the deployment guide below.

### Exercise library

`seeds/exercises.json` holds the public exercise library (exercises, muscles and how much each exercise works each muscle). To load it into a database yourself, or to refresh the file from one:

```bash
npm run seed:exercises     # needs an admin first: npm run seed:admin
npm run export:exercises   # overwrites seeds/exercises.json from the current database
```

## Configuration

The API reads its settings from environment variables and refuses to start when one is missing or invalid (`src/config/env.ts`). [`.env.production.example`](.env.production.example) lists every variable with an explanation; `generate-secrets.sh` fills in the secrets. The main groups:

| Group | Variables | Notes |
|---|---|---|
| Core | `NODE_ENV`, `PORT`, `DATABASE_URL`, `REDIS_URL` | |
| Tokens | `ACCESS_TOKEN_SECRET`, `ADMIN_ACCESS_TOKEN_SECRET` | Separate secrets for users and admins |
| Browser access | `CORS_ORIGINS`, `COOKIE_SECURE`, `COOKIE_SAMESITE`, `COOKIE_DOMAIN`, `TRUST_PROXY_HOPS` | `CORS_ORIGINS` is required in production |
| Sign-in codes | `RESEND_API_KEY`, `EMAIL_FROM`; `PHONE_OTP_ENABLED`, `TWILIO_*` | Email is required in production; WhatsApp is optional |
| CAPTCHA | `CAPTCHA_PROVIDER`, `CAPTCHA_SECRET` | ALTCHA by default |
| AI check-ins | `GROQ_API_KEY`, `GROQ_MODEL`, `GROQ_DAILY_REQUEST_LIMIT` | Optional |
| Exercise images | `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_PUBLIC_URL`, `S3_FORCE_PATH_STYLE` | Optional; any S3-compatible storage (Cloudflare R2, AWS S3, MinIO, …) |
| First admin | `DEFAULT_ADMIN_EMAIL`, `DEFAULT_ADMIN_PASSWORD` | Used only when no admin exists |
| Monitoring | `METRICS_*`, `REQUEST_LOG_*`, `PROMETHEUS_URL`, `GRAFANA_*`, `ALERT_EMAIL_TO` | Optional; see [Monitoring](deployment/monitoring/MONITORING.md) |

## Deployment

The API ships with two deployment modes:

| Mode | Description |
|---|---|
| `with-db` | Docker manages PostgreSQL, Redis, **and** the API |
| `api-only` | API container only — connects to an existing PostgreSQL and Redis on the host |

→ [Deployment Guide](deployment/DEPLOY.md)

→ [Monitoring](deployment/monitoring/MONITORING.md): Prometheus + Grafana with email alerts, and the admin panel's API page (latency percentiles, errors by type, slow requests), switched on with `COMPOSE_PROFILES=monitoring`.

→ [Backups and the live standby](deployment/BACKUPS.md): nightly encrypted backups to any S3-compatible bucket, and an optional streaming standby on a second server, both switched on with `.env`.
