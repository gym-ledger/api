# Deploy: api-only Mode

Only the **API** runs in Docker. It connects to PostgreSQL and Redis already running on the host machine via `host.docker.internal`.

---

## Prerequisites

- Docker + Docker Compose v2
- Git
- `openssl`
- PostgreSQL and Redis running and accessible on the host

---

## Steps

### 1. Complete initial setup

Follow the [initial setup steps](../DEPLOY.md#initial-setup-both-modes) first (clone + copy `.env`).

---

### 2. Fill in `.env`

Open `.env` and make the following changes:

**Set the deploy mode:**
```
DEPLOY_MODE=api-only
```

**Update host references** (the API container reaches host services via `host.docker.internal`):
```
DATABASE_HOST=host.docker.internal
REDIS_URL=redis://host.docker.internal:6379
```

**Update `DATABASE_URL`** to use the correct host:
```
DATABASE_URL=postgresql://workout_gym_api_user:<DATABASE_PASSWORD>@host.docker.internal:5432/workout_gym_api_db
```

**Generate secrets** by running the helper script from the project root:

```bash
bash generate-secrets.sh
```

This generates `DATABASE_PASSWORD`, `ACCESS_TOKEN_SECRET`, and `ADMIN_ACCESS_TOKEN_SECRET`, and rebuilds `DATABASE_URL` to match. It skips any variable that was already set, so it is safe to re-run.

`POSTGRES_USER`, `POSTGRES_PASSWORD`, and `POSTGRES_DB` are not used in this mode — you can leave or remove them.

---

### 3. Create the app database user and database on the host

Connect to your PostgreSQL instance as a superuser and run:

```sql
CREATE USER workout_gym_api_user WITH PASSWORD '<DATABASE_PASSWORD>';
CREATE DATABASE workout_gym_api_db OWNER workout_gym_api_user;
GRANT ALL PRIVILEGES ON DATABASE workout_gym_api_db TO workout_gym_api_user;
```

Replace `<DATABASE_PASSWORD>` with the value you set in `.env`.

---

### 4. Make `deploy.sh` executable (first time only)

```bash
chmod +x deploy.sh
```

---

### 5. Deploy

```bash
bash deploy.sh
```

This will:
- Pull latest code from the current branch
- Copy `deployment/no-db-no-redis/docker-compose.yml` and `Dockerfile` to the project root
- Build and start the `workout-gym-api` container

On first start the container entrypoint automatically runs database migrations and seeds the default admin user (`DEFAULT_ADMIN_EMAIL` / `DEFAULT_ADMIN_PASSWORD` from `.env`). Both steps are idempotent and are skipped on subsequent restarts if already applied.

---

### 6. Verify

```bash
curl http://localhost:4000/health
# → {"ok":true}
```

View API logs:

```bash
docker logs -f workout-gym-api
```

---

## Troubleshooting

**API exits immediately on startup**
Check logs for missing/invalid env vars:
```bash
docker logs workout-gym-api
```

**Database connection refused**
- Confirm `DATABASE_HOST=host.docker.internal` in `.env` (not `localhost`)
- Confirm the password in `DATABASE_URL` matches `DATABASE_PASSWORD`
- Confirm the `workout_gym_api_user` user and `workout_gym_api_db` database exist on the host

**`host.docker.internal` not resolving**
This is automatic on Docker Desktop. On Linux servers, the `extra_hosts` entry in the Compose file adds it — ensure your Docker version is 20.10+.
