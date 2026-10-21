#!/bin/sh
# Runs once per deploy next to the primary Postgres (BACKUPS.md, "Live
# standby"). With REPLICATION_ENABLED=true it makes the server ready for a
# streaming standby; with anything else it removes what an earlier run set
# up, so replication can be turned on or off at any time. The Postgres
# container itself is never restarted.
#
# Needs: the server's data volume at $PGDATA (to edit pg_hba.conf) and a
# superuser connection (PGHOST, PGUSER, PGPASSWORD).
set -eu

HBA="$PGDATA/pg_hba.conf"
BEGIN_MARK="# BEGIN gym-ledger replication (managed by setup-primary.sh)"
END_MARK="# END gym-ledger replication"
SLOT="${REPLICATION_SLOT:-gym_ledger_standby}"

sql() { psql -v ON_ERROR_STOP=1 -d postgres -Atc "$1"; }

# Waits for the server (compose also waits for it to be healthy).
for _ in $(seq 1 30); do
    pg_isready -q && break
    sleep 2
done

remove_hba_block() {
    if grep -qF "$BEGIN_MARK" "$HBA"; then
        sed -i "/$BEGIN_MARK/,/$END_MARK/d" "$HBA"
        return 0
    fi
    return 1
}

# This runs as root; the server (postgres user) must still own the file.
trap 'chown postgres:postgres "$HBA" 2>/dev/null || true' EXIT

if [ "${REPLICATION_ENABLED:-false}" != "true" ]; then
    changed=false
    remove_hba_block && changed=true
    # A slot nobody reads makes the primary keep WAL forever: drop it.
    if [ "$(sql "SELECT count(*) FROM pg_replication_slots WHERE slot_name = '$SLOT'")" != "0" ]; then
        sql "SELECT pg_drop_replication_slot('$SLOT')" > /dev/null
        changed=true
    fi
    if [ "$changed" = true ]; then
        sql "SELECT pg_reload_conf()" > /dev/null
        echo "[replication] Off: removed the standby's access and slot."
    else
        echo "[replication] Off."
    fi
    exit 0
fi

: "${REPLICATION_USER:?REPLICATION_USER is required when REPLICATION_ENABLED=true}"
: "${REPLICATION_PASSWORD:?REPLICATION_PASSWORD is required when REPLICATION_ENABLED=true}"
case "$REPLICATION_USER" in
    *[!a-z0-9_]*) echo "[replication] REPLICATION_USER may only contain a-z, 0-9 and _" >&2; exit 1 ;;
esac
case "$SLOT" in
    *[!a-z0-9_]*) echo "[replication] REPLICATION_SLOT may only contain a-z, 0-9 and _" >&2; exit 1 ;;
esac

# The role, its password (as a psql variable, so any characters are safe)
# and the slot that keeps WAL until the standby has it.
psql -v ON_ERROR_STOP=1 -d postgres -v user="$REPLICATION_USER" -v pw="$REPLICATION_PASSWORD" <<'SQL' > /dev/null
SELECT format('CREATE ROLE %I WITH REPLICATION LOGIN', :'user')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'user') \gexec
SELECT format('ALTER ROLE %I WITH REPLICATION LOGIN PASSWORD %L', :'user', :'pw') \gexec
SQL
if [ "$(sql "SELECT count(*) FROM pg_replication_slots WHERE slot_name = '$SLOT'")" = "0" ]; then
    sql "SELECT pg_create_physical_replication_slot('$SLOT')" > /dev/null
    echo "[replication] Created slot $SLOT."
fi
# If the standby is gone for long, give up on it rather than fill the disk.
sql "ALTER SYSTEM SET max_slot_wal_keep_size = '${REPLICATION_MAX_WAL_KEEP:-4GB}'" > /dev/null

# Replication connections arrive through the forwarder (replication-proxy)
# and the published loopback port, so they come from the Docker network:
# "samenet" = the server's own subnets. Password (SCRAM) required.
remove_hba_block || true
{
    echo "$BEGIN_MARK"
    echo "host replication $REPLICATION_USER samenet scram-sha-256"
    echo "$END_MARK"
} >> "$HBA"

sql "SELECT pg_reload_conf()" > /dev/null
echo "[replication] On: user $REPLICATION_USER, slot $SLOT."
