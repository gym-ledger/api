# Prometheus with this repo's config baked in. Copied, not bind-mounted: the
# server's deploy script checks files out with umask 077 (root-only), and
# Prometheus runs as nobody, so a bind mount is unreadable to it.
FROM prom/prometheus:v3.15.0

COPY --chmod=644 prometheus.yml /etc/prometheus/prometheus.yml
