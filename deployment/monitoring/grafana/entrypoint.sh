#!/bin/sh
# Grafana start-up guard (deployment/monitoring/MONITORING.md).
#  - Refuses to start without an admin password: Grafana's built-in default
#    is admin/admin, which must never be live.
#  - Email alerting is provisioned only when ALERT_EMAIL_TO is set, so a
#    server without it still gets dashboards.
set -eu

if [ -z "${GF_SECURITY_ADMIN_PASSWORD:-}" ]; then
    echo "GRAFANA_ADMIN_PASSWORD must be set in .env (Grafana would otherwise start with admin/admin)" >&2
    exit 1
fi

target="${GF_PATHS_PROVISIONING:-/etc/grafana/provisioning}/alerting"
mkdir -p "$target"
rm -f "$target"/*.yml
if [ -n "${ALERT_EMAIL_TO:-}" ]; then
    cp /etc/gym-ledger/alerting/*.yml "$target"/
    echo "Email alerts go to: $ALERT_EMAIL_TO"
else
    echo "ALERT_EMAIL_TO not set: alerting is off (dashboards only)"
fi

exec /run.sh "$@"
