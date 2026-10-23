# Monitoring

How the API reports its performance and errors, and how to see them.

```
           ┌──────────── GET /metrics on :9464 (Docker network only) ────────────┐
           │                                                                     ▼
 API ──────┤                                                            Prometheus (:9090)
           │                                                              │          ▲
           └── errors + slow requests ──▶ Postgres                         │          │ PromQL
               (api_request_issues)          │                             ▼          │
                                             │                       Grafana (:3002)  │
                                             ▼                       dashboards,      │
                                   Admin panel "API" page ◀── admin API ──────────────┘
                                                              email alerts
```

There are two stores, each for what it's good at:

| | Prometheus | `api_request_issues` (Postgres) |
|---|---|---|
| What | Every request, as counters and latency histograms | Only errors (status ≥ 400) and slow requests (≥ `REQUEST_LOG_SLOW_MS`, default 500 ms). Unmatched 404s and expired-token 401s are counted in Prometheus but not logged here |
| Answers | p50/p95/p99, requests/min, error rates by status and type, per route; process health | Which request failed, for whom, with what message (and a stack trace for 5xx) |
| Kept | 30 days or 2 GB (`PROMETHEUS_RETENTION`, `PROMETHEUS_RETENTION_SIZE`) | 30 days (`REQUEST_LOG_RETENTION_DAYS`), purged hourly |
| Shown in | Grafana, and the admin panel's API page | The admin panel's API page |

## What is measured

All in `src/infrastructure/metrics` and `src/middleware/requestMetrics.ts`.

| Metric | Labels | Notes |
|---|---|---|
| `http_request_duration_seconds` (histogram) | `method`, `route`, `status_code` | From the first middleware to the end of the response |
| `http_errors_total` | `method`, `route`, `status_code`, `error_type` | `error_type` is the `error.type` sent to the client (`VALIDATION_ERROR`, `NOT_FOUND`, `RATE_LIMITED`, …). 401s from an expired access token are `TOKEN_EXPIRED`: they are the normal refresh path, so dashboards and the 4xx rate leave them out |
| `http_requests_aborted_total` | `method`, `route` | Client disconnected before the response finished |
| `http_requests_in_flight` | | |
| `pg_pool_connections` | `state` = total / idle / waiting | `waiting > 0`: requests are queueing for a connection |
| `notification_streams_open` | | Open SSE streams |
| `ai_requests_total`, `ai_request_duration_seconds` | `feature`, `status` | Groq calls |
| `api_request_issues_dropped_total` | `reason` | Error/slow rows that couldn't be written |
| `nodejs_*`, `process_*` | | prom-client defaults: event-loop lag, heap, GC, CPU |

**`route`** is the route template (`/api/v1/user/workout/sessions/:sessionId/detail`), never the raw URL. Requests that never reached a route are `unmatched` (404, mostly scanners) or `pre_route` (rejected earlier, e.g. a 429 from the rate limiter or a 401 from a router-level auth check).

**Not measured:** `/health` (the Docker health check) and the notification event stream (open for minutes by design; it would skew every percentile; see `notification_streams_open`).

**Privacy.** Prometheus labels never hold user ids or URLs. `api_request_issues` holds the URL path (which can include resource ids), the user or admin id, and the error message, but no query strings, bodies, headers or IPs. Deleting an account clears its `user_id` there.

**Request ids.** Every response has an `X-Request-Id` header. The same id is in the API's log lines and on the row in `api_request_issues`, so an error a user reports can be traced.

**Percentiles are estimates.** Prometheus computes them from histogram buckets (5 ms … 10 s, denser around 500 ms), so "p95 = 230 ms" means "between the 150 ms and 250 ms buckets, interpolated". Good enough to spot trends and regressions. `api_request_issues` has exact durations for slow requests.

## Turning it on (server)

1. In `.env` (see `.env.production.example`, "Monitoring"):
   ```
   COMPOSE_PROFILES=monitoring
   PROMETHEUS_URL=http://prometheus:9090
   GRAFANA_URL=http://localhost:3002
   GRAFANA_ADMIN_PASSWORD=<long random password>
   ```
2. Deploy as usual (`./deploy.sh`). Prometheus and Grafana start next to the API.

The metrics port (9464) is never published on the host; Prometheus reaches it over the Docker network. `/metrics` is not served on the public API port.

**RAM:** Prometheus is typically 150–400 MB at this scale, Grafana 100–250 MB.

**Turning it off:** remove `monitoring` from `COMPOSE_PROFILES` and deploy. The API keeps serving metrics on 9464 (`METRICS_ENABLED=false` stops that too) and keeps writing `api_request_issues`; the admin page shows the error log without the latency charts.

### Email alerts

Grafana emails `ALERT_EMAIL_TO` through SMTP. With Resend:

```
ALERT_EMAIL_TO=you@example.com
GRAFANA_SMTP_ENABLED=true
GRAFANA_SMTP_HOST=smtp.resend.com:587
GRAFANA_SMTP_USER=resend
GRAFANA_SMTP_PASSWORD=<a Resend API key; a separate "sending only" key is best>
GRAFANA_SMTP_FROM=alerts@<your verified domain>
```

Alerts (`grafana/alerting/api-alerts.yml`):

| Alert | Fires when |
|---|---|
| API is down | Prometheus can't scrape the API for 2 min |
| High server error rate | > 2% of requests are 5xx for 5 min (at least 20 requests) |
| API is slow | p95 > 1 s for 10 min |
| Node event loop is blocked | event-loop lag p99 > 200 ms for 5 min |
| Requests waiting for a DB connection | pool `waiting > 0` for 5 min |
| Error/slow log dropping rows | any dropped in 15 min |

Test the email setup from Grafana: Alerting → Contact points → `admin-email` → Test.

## Opening Grafana

Grafana listens on `127.0.0.1:3002` on the server, never on a public interface. Sign in with `admin` and `GRAFANA_ADMIN_PASSWORD`. That password is only applied the first time Grafana starts; after that, change it in Grafana (Profile → Change password), not in `.env`.

### SSH tunnel (default)

```bash
ssh -N -L 3002:localhost:3002 -L 9090:localhost:9090 you@your-server
```

Then open http://localhost:3002 (Grafana) or http://localhost:9090 (Prometheus). Nothing extra to set up or secure.

### Tailscale (optional)

If the server is on your tailnet (the live standby already uses one), share Grafana with the tailnet over HTTPS:

```bash
sudo tailscale serve --bg 3002
```

Open `https://<server-name>.<tailnet>.ts.net`. Only devices on your tailnet can reach it. Set `GRAFANA_URL` to that address so the admin panel links to it. (`tailscale serve status` shows it; `tailscale serve reset` removes it. Check `tailscale serve --help` on your version.)

### Cloudflare Tunnel + Access (optional)

To use `https://grafana.example.com` with a login at Cloudflare's edge, so the server opens no port:

1. Cloudflare Zero Trust → Networks → Tunnels → Create a tunnel (cloudflared). Copy its token.
2. In the tunnel's Public Hostname tab: `grafana.example.com` → `http://grafana:3000`.
3. Zero Trust → Access → Applications → Add a self-hosted application for `grafana.example.com`, with a policy that allows only your email(s) (one-time PIN or Google login). **Create this before step 4**, or the hostname is public with only Grafana's password in front of it.
4. In `.env`:
   ```
   COMPOSE_PROFILES=monitoring,cloudflare-tunnel
   CLOUDFLARE_TUNNEL_TOKEN=<token>
   GRAFANA_URL=https://grafana.example.com
   ```
5. Deploy.

Grafana's own login stays on behind Access.

## Local development

- `npm run dev` serves metrics on http://localhost:9464/metrics.
- The whole stack with monitoring:
  ```bash
  docker compose -f stack/docker-compose.yml --profile monitoring up --build
  ```
  Grafana: http://localhost:3002 (`admin` / `local-grafana-password`); Prometheus: http://localhost:9090. The admin panel's API page reads this Prometheus.

## Changing things

- **Dashboards:** `grafana/dashboards/*.json` load on start and can't be edited in place in Grafana. To keep a change: edit in Grafana → Save as a copy, or export the JSON and replace the file.
- **Alerts:** edit `grafana/alerting/api-alerts.yml` and deploy.
- **Config is baked into the images** (`grafana/Dockerfile`, `prometheus/Dockerfile`), not bind-mounted: the deploy checks files out root-only (umask 077), which Grafana (uid 472) and Prometheus (nobody) can't read. Any config change reaches them on the next deploy, which rebuilds both.
- **Slow threshold / retention:** `REQUEST_LOG_SLOW_MS`, `REQUEST_LOG_RETENTION_DAYS`, `PROMETHEUS_RETENTION`.
- **New labels:** keep them low-cardinality (a handful of values). A user id or raw URL as a label creates one time series per value and can exhaust Prometheus's memory.
- **More than one API instance:** add each to `prometheus/prometheus.yml`. Histograms and counters add up across instances; the admin page and dashboards already `sum` them.
