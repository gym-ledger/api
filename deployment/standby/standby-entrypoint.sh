#!/bin/sh
# Starts a streaming standby of the primary (BACKUPS.md, "Live standby").
# The first start copies the primary with pg_basebackup (-R writes the
# standby settings and standby.signal); every start after that just runs
# Postgres, which follows the primary and serves read-only queries.
set -eu

: "${PRIMARY_HOST:?PRIMARY_HOST is required (the primary's private IP)}"
: "${REPLICATION_USER:?REPLICATION_USER is required}"
: "${REPLICATION_PASSWORD:?REPLICATION_PASSWORD is required}"
PRIMARY_PORT="${PRIMARY_PORT:-5433}"
SLOT="${REPLICATION_SLOT:-gym_ledger_standby}"

if [ ! -s "$PGDATA/PG_VERSION" ]; then
    echo "[standby] Empty data directory: copying the primary at $PRIMARY_HOST:$PRIMARY_PORT (this can take a while)..."
    mkdir -p "$PGDATA"
    chown postgres:postgres "$PGDATA"
    chmod 700 "$PGDATA"
    # The password goes through PGPASSWORD, not the command line.
    su-exec postgres env PGPASSWORD="$REPLICATION_PASSWORD" pg_basebackup \
        -h "$PRIMARY_HOST" -p "$PRIMARY_PORT" -U "$REPLICATION_USER" \
        -D "$PGDATA" -S "$SLOT" -X stream -R -P
    echo "[standby] Copy complete."
fi

# docker-entrypoint.sh skips initialisation for a non-empty data directory
# and starts the server; standby.signal makes it a hot standby.
exec docker-entrypoint.sh postgres -c hot_standby=on
