# Deployment Guide

## Modes

| Mode | When to use | Guide |
|---|---|---|
| `with-db` | Fresh server — Docker runs Postgres, Redis, and the API | [Deploy with DB](db/DEPLOY_WITH_DB.md) |
| `api-only` | Postgres and Redis are already running on the host | [Deploy API only](no-db-no-redis/DEPLOY_API_ONLY.md) |

---

## Prerequisites

- Docker + Docker Compose v2
- Git
- `openssl` (for generating secrets)

---

## Initial Setup (both modes)

These steps are done **once** when you first set up the server.

**1. Clone the repository**

```bash
git clone <your-repo-url> workout-gym-api
cd workout-gym-api
```

**2. Create `.env` from the production template**

```bash
cp .env.production .env
```

**3. Follow the mode-specific guide** to fill in secrets and deploy:

- [with-db →](db/DEPLOY_WITH_DB.md)
- [api-only →](no-db-no-redis/DEPLOY_API_ONLY.md)

---

## Subsequent Deploys

Once the server is set up, all future deploys are a single command from the project root:

```bash
bash deploy.sh
```

`deploy.sh` pulls the latest code and rebuilds + restarts containers. The container entrypoint runs any pending migrations automatically on startup — no manual step needed.
