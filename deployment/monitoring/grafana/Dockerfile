# Grafana with this repo's provisioning baked in. Copied, not bind-mounted:
# the server's deploy script checks files out with umask 077 (root-only), and
# Grafana runs as uid 472, so a bind mount is unreadable to it.
FROM grafana/grafana-oss:12.4.3

COPY --chmod=755 entrypoint.sh /etc/gym-ledger/entrypoint.sh
COPY --chmod=755 alerting /etc/gym-ledger/alerting
COPY --chmod=755 provisioning/datasources /etc/grafana/provisioning/datasources
COPY --chmod=755 provisioning/dashboards /etc/grafana/provisioning/dashboards
# Not under /var/lib/grafana: that's the grafana_data volume, which would
# hide newer dashboards once it exists.
COPY --chmod=755 dashboards /etc/grafana/dashboards

ENTRYPOINT ["sh", "/etc/gym-ledger/entrypoint.sh"]
