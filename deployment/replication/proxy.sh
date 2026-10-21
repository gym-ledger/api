#!/bin/sh
# Makes the primary Postgres reachable by the standby on a private address
# only (BACKUPS.md, "Live standby"): listens on REPLICATION_BIND_IP and
# forwards to the loopback port the database is published on. Idles when
# replication is off.
set -eu

if [ "${REPLICATION_ENABLED:-false}" != "true" ]; then
    exec sleep infinity
fi

ip="${REPLICATION_BIND_IP:-}"
port="${REPLICATION_PORT:-5433}"

# Postgres must never be reachable from the internet. Only private and
# Tailscale/CGNAT ranges are accepted.
case "$ip" in
    10.*|192.168.*|100.6[4-9].*|100.[7-9][0-9].*|100.1[01][0-9].*|100.12[0-7].*) ;;
    172.1[6-9].*|172.2[0-9].*|172.3[01].*) ;;
    *)
        echo "[replication-proxy] REPLICATION_BIND_IP must be a private address (e.g. this server's Tailscale or WireGuard IP), got '$ip'. Not listening." >&2
        exec sleep infinity
        ;;
esac

echo "[replication-proxy] Forwarding $ip:$port -> 127.0.0.1:5432"
exec socat "TCP-LISTEN:$port,bind=$ip,reuseaddr,fork" TCP:127.0.0.1:5432
