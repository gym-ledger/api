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

## Deployment

The API ships with two deployment modes:

| Mode | Description |
|---|---|
| `with-db` | Docker manages PostgreSQL, Redis, **and** the API |
| `api-only` | API container only — connects to an existing PostgreSQL and Redis on the host |

→ [Deployment Guide](deployment/DEPLOY.md)
