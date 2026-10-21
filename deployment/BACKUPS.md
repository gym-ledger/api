# Backups and the live standby

Two independent layers, both optional and both switched on or off with `.env` alone:

| | What it protects against | Data you can lose | Needs |
|---|---|---|---|
| **Nightly backups** | Server loss, a bad migration, a mistaken delete (restore yesterday) | Up to a day | An S3-compatible bucket (Cloudflare R2's free tier is enough) |
| **Live standby** | Server loss, with the shortest downtime | Seconds | A second server and a private network to it |

A standby copies every change straight away, mistakes included, so it does **not** replace backups. Run backups first; add the standby when downtime starts to matter.

---

## Nightly backups

Every night the `backup` container dumps **every database on the Postgres server** (not just this app's) plus its roles, checks each dump can be read back, encrypts it with [age](https://age-encryption.org), and uploads it to `s3://<bucket>/<prefix>/<YYYY-MM-DD>/`. It then deletes folders older than `BACKUP_RETENTION_DAYS`, at most 30, which is what the privacy policy promises about deleted data.

### Turn it on

1. **Make a bucket** for backups only, not the image bucket. With Cloudflare R2: R2 → Create bucket (e.g. `gym-ledger-backups`), leave public access **off**. Then R2 → Manage API tokens → Create token with **Object Read & Write** on that bucket only. Note the Access Key ID, Secret Access Key and the S3 endpoint (`https://<account id>.r2.cloudflarestorage.com`).
2. **Add a lifecycle rule** as a second safety net: bucket → Settings → Object lifecycle rules → delete objects after 30 days.
3. **Make an encryption key on your own computer**, not on the server:
   ```bash
   age-keygen -o gym-ledger-backup-key.txt
   ```
   It prints the public key (`age1…`). Keep the file somewhere safe and offline (a password manager). **Without it, the backups can't be restored**, and with it, anyone can read them.
4. **Fill in `.env` on the server:**
   ```
   BACKUP_S3_ENDPOINT=https://<account id>.r2.cloudflarestorage.com
   BACKUP_S3_REGION=auto
   BACKUP_S3_BUCKET=gym-ledger-backups
   BACKUP_S3_ACCESS_KEY_ID=...
   BACKUP_S3_SECRET_ACCESS_KEY=...
   BACKUP_AGE_RECIPIENT=age1...
   BACKUP_RUN_ON_START=true     # one backup right away, to test; set back to false after
   ```
5. **Deploy** (push, or `bash deploy.sh`), then watch the first run:
   ```bash
   docker logs -f gym-ledger-backup
   ```
   You should see each database with its size, then `Done`. Check the files are in the bucket.

Optional: set `BACKUP_PING_URL` to a [healthchecks.io](https://healthchecks.io) check URL to be emailed when a night's backup doesn't happen.

**Cost** for this server (about 410 MB of data, about 56 MB compressed per night): 30 nights × ~56 MB ≈ 1.7 GB, inside R2's free 10 GB, with free downloads. Each run takes under a minute of one CPU core and little memory.

### Restore

On a machine with the private key, `age`, and the Postgres 16 client tools:

```bash
# 1. Download a night's files (any S3 tool; with the AWS CLI:)
aws --endpoint-url https://<account id>.r2.cloudflarestorage.com s3 cp --recursive \
    s3://gym-ledger-backups/postgres/2026-10-21/ ./restore/

# 2. Decrypt
for f in restore/*.age; do age -d -i gym-ledger-backup-key.txt -o "${f%.age}" "$f"; done

# 3. Restore roles first (on a fresh server), then each database
psql -h <host> -U postgres -f restore/*-globals.sql
createdb -h <host> -U postgres -O workout_gym_api_user workout_gym_api_db
pg_restore -h <host> -U postgres -d workout_gym_api_db --no-owner --role=workout_gym_api_user restore/*-workout_gym_api_db.dump
```

To bring a single table back without touching live data, restore into a new database (e.g. `restore_check`) and copy what you need from there.

**Test a restore once a month.** A backup only counts once it has been restored.

### api-only mode

The same `backup` service is in `deployment/no-db-no-redis/docker-compose.yml`. Also set `BACKUP_PGHOST` (default `host.docker.internal`), `BACKUP_PGPORT`, `BACKUP_PGUSER` and `BACKUP_PGPASSWORD`: a superuser login to your Postgres server, which must accept connections from the Docker network.

---

## Live standby

A second Postgres, on another server, that receives every change from this one as it happens (streaming replication). If this server dies, you promote the standby and point the API at it. Data lost: at most the last few seconds.

Turning it on or off is just `.env` plus a deploy, at any time, including months after launch. **The primary database is never restarted for it.** On every deploy, the `replication-setup` container either:
- with `REPLICATION_ENABLED=true`, creates the replication user and slot, allows replication in `pg_hba.conf` (a marked block) and caps the WAL kept for the standby, then reloads the config; or
- otherwise, removes all of that again, including the slot, so a forgotten standby can't fill the disk.

The `replication-proxy` container makes the database reachable on this server's **private** IP only (`REPLICATION_BIND_IP`). Public addresses are refused: Postgres must never be on the open internet.

### Turn it on

1. **Make a private network** between the two servers. Tailscale is the easiest: install it on both, and note each one's `100.x.y.z` address.
2. **On this (primary) server**, in `.env`:
   ```
   REPLICATION_ENABLED=true
   REPLICATION_BIND_IP=100.x.y.z        # THIS server's Tailscale IP
   REPLICATION_PORT=5433
   REPLICATION_USER=replicator
   REPLICATION_PASSWORD=<openssl rand -hex 32>
   ```
   Deploy. `docker compose logs replication-setup` (run in the API folder) should end with `On`.
3. **On the standby server**, copy `deployment/standby/` there, then:
   ```bash
   cp .env.standby.example .env      # PRIMARY_HOST = the primary's Tailscale IP, same user/password/slot
   docker compose up -d
   docker logs -f gym-ledger-standby # first start copies the primary, then follows it
   ```
4. **Check it's following**, on the primary:
   ```bash
   docker exec postgres16 psql -U postgres -c "SELECT client_addr, state, replay_lag FROM pg_stat_replication"
   ```
   You should see one row in state `streaming`.

`REPLICATION_MAX_WAL_KEEP` (default 4GB) is how much change history the primary keeps for a standby that is offline. Past it, the primary stops waiting and the standby has to be copied again: stop it, delete its volume, start it.

### If the primary is lost (failover)

1. On the standby: `docker exec gym-ledger-standby psql -U postgres -c "SELECT pg_promote()"`. It becomes a normal, writable database.
2. Point the API at it: set `DATABASE_URL` (and Redis) to the standby server and deploy the API there, or move the API there as well.
3. The old primary can't simply rejoin. Once it's back, set it up as a fresh standby of the new primary, or rebuild it from the new primary and switch back.

This is manual on purpose: automatic failover needs a third machine to decide who is primary, or a split network can leave two primaries both taking writes.

### Turn it off

Set `REPLICATION_ENABLED=false` and deploy. The setup removes the standby's access and drops the slot. Then stop the standby server's container.
