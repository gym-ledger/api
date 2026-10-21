#!/bin/sh
# One backup run: every database on the server plus its roles, each dumped,
# checked, encrypted with age and uploaded; then backups older than the
# retention window are deleted from the bucket. See deployment/BACKUPS.md.
set -eu

# The privacy policy promises deleted data leaves backups within 30 days.
MAX_RETENTION_DAYS=30
retention="${BACKUP_RETENTION_DAYS:-30}"
if [ "$retention" -gt "$MAX_RETENTION_DAYS" ] 2>/dev/null; then
    echo "[backup] BACKUP_RETENTION_DAYS=$retention is over $MAX_RETENTION_DAYS; using $MAX_RETENTION_DAYS (privacy policy)." >&2
    retention=$MAX_RETENTION_DAYS
fi

export AWS_ACCESS_KEY_ID="$BACKUP_S3_ACCESS_KEY_ID"
export AWS_SECRET_ACCESS_KEY="$BACKUP_S3_SECRET_ACCESS_KEY"
export AWS_DEFAULT_REGION="${BACKUP_S3_REGION:-auto}"
s3() {
    if [ -n "${BACKUP_S3_ENDPOINT:-}" ]; then
        aws --endpoint-url "$BACKUP_S3_ENDPOINT" s3 "$@"
    else
        aws s3 "$@"
    fi
}

ping() {
    [ -n "${BACKUP_PING_URL:-}" ] && curl -fsS -m 10 --retry 3 "$BACKUP_PING_URL$1" >/dev/null 2>&1 || true
}

prefix="${BACKUP_S3_PREFIX:-postgres}"
day="$(date -u +%Y-%m-%d)"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
dest="s3://$BACKUP_S3_BUCKET/$prefix/$day"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

fail() {
    echo "[backup] FAILED: $1" >&2
    ping "/fail"
    exit 1
}

echo "[backup] Starting $stamp"
ping "/start"

# Roles and their passwords (needed to restore onto a fresh server).
pg_dumpall --globals-only > "$work/globals.sql" || fail "pg_dumpall --globals-only"
age -r "$BACKUP_AGE_RECIPIENT" -o "$work/globals.sql.age" "$work/globals.sql" || fail "encrypt globals"
rm "$work/globals.sql"
s3 cp --only-show-errors "$work/globals.sql.age" "$dest/$stamp-globals.sql.age" || fail "upload globals"

databases="$(psql -d postgres -Atc "SELECT datname FROM pg_database WHERE NOT datistemplate AND datname <> 'postgres' ORDER BY datname")" \
    || fail "list databases"
for db in $databases; do
    file="$work/$db.dump"
    pg_dump -d "$db" -Fc -f "$file" || fail "pg_dump $db"
    # A dump that can't be read back is worse than none: it looks like a backup.
    pg_restore --list "$file" > /dev/null || fail "verify $db"
    size="$(wc -c < "$file")"
    age -r "$BACKUP_AGE_RECIPIENT" -o "$file.age" "$file" || fail "encrypt $db"
    rm "$file"
    s3 cp --only-show-errors "$file.age" "$dest/$stamp-$db.dump.age" || fail "upload $db"
    rm "$file.age"
    echo "[backup] $db: $size bytes"
done

# Retention: delete day folders older than the window. (A bucket lifecycle
# rule doing the same is a good second line of defence; see BACKUPS.md.)
cutoff="$(date -u -d "@$(( $(date +%s) - retention * 86400 ))" +%Y-%m-%d)"
s3 ls "s3://$BACKUP_S3_BUCKET/$prefix/" | awk '$1 == "PRE" { sub("/", "", $2); print $2 }' | while read -r folder; do
    case "$folder" in
        [0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9])
            # Keeps the last $retention days, so nothing in the bucket is older than that.
            if [ ! "$folder" \> "$cutoff" ]; then
                s3 rm --only-show-errors --recursive "s3://$BACKUP_S3_BUCKET/$prefix/$folder/" && echo "[backup] Deleted backups from $folder"
            fi
            ;;
    esac
done

echo "[backup] Done $stamp"
ping ""
