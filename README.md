# workout-gym-api

REST API for a workout and gym management application. Handles user authentication, exercise tracking, workout programs, and body weight progression.

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

One command starts PostgreSQL, Redis, this API, the [user app](../gym-app-nextjs) and the [admin panel](../workout-gym-admin-panel) on your machine, with the exercise library already loaded.

**You need:** Docker with Compose v2, and the three repos cloned side by side:

```
some-folder/
├── workout-gym-api/
├── gym-app-nextjs/
└── workout-gym-admin-panel/
```

**Start it** from `workout-gym-api/`:

```bash
docker compose -f stack/docker-compose.yml up --build
```

The first build takes a few minutes. When the logs settle, open:

| What | URL | Sign in with |
|---|---|---|
| User app | http://localhost:3000 | Any email. The 6-digit code is printed in the API log (see below) |
| Admin panel | http://localhost:3001 | `admin@example.com` / `local-admin-password` |
| API | http://localhost:4000/api/v1 | `GET /health` returns `{ "ok": true }` |

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

**Stop it** with `Ctrl+C`, or `docker compose -f stack/docker-compose.yml down`. Add `-v` to also delete the database.

This setup is for trying the project and for development only: it runs with `NODE_ENV=development`, fixed secrets and plain http. To run it on a server, use the deployment guide below.

### Exercise library

`seeds/exercises.json` holds the public exercise library (exercises, muscles and how much each exercise works each muscle). To load it into a database yourself, or to refresh the file from one:

```bash
npm run seed:exercises     # needs an admin first: npm run seed:admin
npm run export:exercises   # overwrites seeds/exercises.json from the current database
```

## Deployment

The API ships with two deployment modes:

| Mode | Description |
|---|---|
| `with-db` | Docker manages PostgreSQL, Redis, **and** the API |
| `api-only` | API container only — connects to an existing PostgreSQL and Redis on the host |

→ [Deployment Guide](deployment/DEPLOY.md)
