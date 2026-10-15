# Deploy: with-db Mode

Docker manages **PostgreSQL 16**, **Redis 7**, and the **API** together in one Compose stack.

---

## Prerequisites

- Docker + Docker Compose v2
- Git
- `openssl`

---

## Steps

### 1. Complete initial setup

Follow the [initial setup steps](../DEPLOY.md#initial-setup-both-modes) first (clone + copy `.env`).

---

### 2. Generate secrets

Run the helper script from the project root:

```bash
bash generate-secrets.sh
```

This generates `POSTGRES_PASSWORD`, `DATABASE_PASSWORD`, `REDIS_PASSWORD`, `ACCESS_TOKEN_SECRET`, and `ADMIN_ACCESS_TOKEN_SECRET`, and rebuilds `DATABASE_URL` and `REDIS_URL` to match. It skips any variable that was already set, so it is safe to re-run.

Everything else in `.env` is correct for this mode and does not need to change.

---

### 3. Make `deploy.sh` executable (first time only)

```bash
chmod +x deploy.sh
```

---

### 4. Deploy

```bash
bash deploy.sh
```

This will:
- Pull latest code from the current branch
- Copy `deployment/db/docker-compose.yml` and `Dockerfile` to the project root
- Build the API image and start all three containers (`postgres16`, `redis7`, `workout-gym-api`)

On first start the container entrypoint automatically runs database migrations and seeds the default admin user (`DEFAULT_ADMIN_EMAIL` / `DEFAULT_ADMIN_PASSWORD` from `.env`). Both steps are idempotent and are skipped on subsequent restarts if already applied.

---

### 5. Verify

```bash
curl http://localhost:4000/health
# → {"ok":true}
```

Check container status:

```bash
docker compose ps
```

View API logs:

```bash
docker logs -f workout-gym-api
```

---

## Troubleshooting

**API exits immediately on startup**
The `env` config validator (`src/config/env.ts`) calls `process.exit(1)` if any required variable is missing or malformed. Check logs:
```bash
docker logs workout-gym-api
```

**Database connection refused**
- Confirm `DATABASE_HOST=postgres` in `.env` (not `localhost`)
- Confirm the password in `DATABASE_URL` matches `DATABASE_PASSWORD`

**Postgres init failed / wrong password**
The `init.sh` script only runs when the `postgres_data` volume is first created. If you changed credentials after a failed first boot, destroy the volume and redeploy:
```bash
docker compose down -v
bash deploy.sh
```

**`REDIS_PASSWORD must be set in .env` (upgrading an existing server)**
Redis now requires a password, and Postgres/Redis are published on `127.0.0.1` only. On a server whose `.env` predates this, add both lines (then `bash deploy.sh`):
```bash
REDIS_PASSWORD=$(openssl rand -hex 32)
echo "REDIS_PASSWORD=$REDIS_PASSWORD" >> .env
sed -i "s|^REDIS_URL=.*$|REDIS_URL=redis://:$REDIS_PASSWORD@redis:6379|" .env
```
To reach Postgres from your machine, use an SSH tunnel: `ssh -L 5432:127.0.0.1:5432 <server>`.
