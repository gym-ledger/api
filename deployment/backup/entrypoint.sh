#!/bin/sh
# Schedules backup.sh with cron, or idles when backups aren't configured, so
# they can be turned on later just by setting the BACKUP_* variables and
# redeploying.
set -eu

if [ -z "${BACKUP_S3_BUCKET:-}" ]; then
    echo "[backup] BACKUP_S3_BUCKET is not set: backups are off. See deployment/BACKUPS.md."
    exec sleep infinity
fi

# Fail at start, not at 3 a.m., if something required is missing.
for var in BACKUP_S3_ACCESS_KEY_ID BACKUP_S3_SECRET_ACCESS_KEY BACKUP_AGE_RECIPIENT PGHOST PGUSER PGPASSWORD; do
    eval "value=\${$var:-}"
    if [ -z "$value" ]; then
        echo "[backup] $var is required when BACKUP_S3_BUCKET is set. Backups are NOT running." >&2
        exec sleep infinity
    fi
done

schedule="${BACKUP_SCHEDULE:-30 3 * * *}"
echo "$schedule /usr/local/bin/backup.sh" > /etc/crontabs/root
echo "[backup] Scheduled: '$schedule' (container time zone: ${TZ:-UTC}). Bucket: $BACKUP_S3_BUCKET/${BACKUP_S3_PREFIX:-postgres}"

if [ "${BACKUP_RUN_ON_START:-false}" = "true" ]; then
    /usr/local/bin/backup.sh || true
fi

exec crond -f -l 8
