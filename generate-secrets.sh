#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

PLACEHOLDER="generated-by-openssl-rand-hex-32"

# ── Portable sed -i (macOS requires an empty string argument) ─────────────────
if [[ "$(uname)" == "Darwin" ]]; then
    sedi() { sed -i '' "$@"; }
else
    sedi() { sed -i "$@"; }
fi

# ── Copy .env.production → .env if .env doesn't exist ────────────────────────
if [[ ! -f .env ]]; then
    if [[ ! -f .env.production ]]; then
        echo "Error: .env.production not found in $SCRIPT_DIR" >&2
        exit 1
    fi
    echo "==> .env not found — copying from .env.production"
    cp .env.production .env
fi

# ── Replace a key's placeholder value with a generated secret ─────────────────
replace_if_placeholder() {
    local key="$1"
    local value="$2"
    sedi "s|^${key}=${PLACEHOLDER}$|${key}=${value}|" .env
}

# ── Generate each secret that still holds the placeholder ─────────────────────
changed=false

for key in POSTGRES_PASSWORD DATABASE_PASSWORD REDIS_PASSWORD ACCESS_TOKEN_SECRET ADMIN_ACCESS_TOKEN_SECRET DEFAULT_ADMIN_PASSWORD; do
    if grep -qE "^${key}=${PLACEHOLDER}$" .env; then
        replace_if_placeholder "$key" "$(openssl rand -hex 32)"
        echo "==> Generated  $key"
        changed=true
    else
        echo "==> Skipping   $key (already set)"
    fi
done

# ── Rebuild DATABASE_URL if it still holds the placeholder ────────────────────
# Reads the individual vars from .env so the URL stays in sync with DATABASE_PASSWORD.
if grep -qE "^DATABASE_URL=.*${PLACEHOLDER}" .env; then
    DB_USER=$(grep -E "^DATABASE_USER=" .env | cut -d'=' -f2-)
    DB_PASS=$(grep -E "^DATABASE_PASSWORD=" .env | cut -d'=' -f2-)
    DB_HOST=$(grep -E "^DATABASE_HOST=" .env | cut -d'=' -f2-)
    DB_PORT=$(grep -E "^DATABASE_PORT=" .env | cut -d'=' -f2-)
    DB_NAME=$(grep -E "^DATABASE_NAME=" .env | cut -d'=' -f2-)
    sedi "s|^DATABASE_URL=.*$|DATABASE_URL=postgresql://${DB_USER}:${DB_PASS}@${DB_HOST}:${DB_PORT}/${DB_NAME}|" .env
    echo "==> Rebuilt    DATABASE_URL"
    changed=true
else
    echo "==> Skipping   DATABASE_URL (already set)"
fi

# ── Rebuild REDIS_URL if it still holds the placeholder ───────────────────────
if grep -qE "^REDIS_URL=.*${PLACEHOLDER}" .env; then
    REDIS_PASS=$(grep -E "^REDIS_PASSWORD=" .env | cut -d'=' -f2-)
    sedi "s|^REDIS_URL=.*$|REDIS_URL=redis://:${REDIS_PASS}@redis:6379|" .env
    echo "==> Rebuilt    REDIS_URL"
    changed=true
else
    echo "==> Skipping   REDIS_URL (already set)"
fi

# ── The first admin account needs a real email (seed-admin refuses defaults) ─
admin_email=$(grep -E "^DEFAULT_ADMIN_EMAIL=" .env | cut -d"=" -f2- || true)
if [[ -z "$admin_email" || "$admin_email" == "admin@admin.com" ]]; then
    echo ""
    echo "==> ACTION NEEDED: set DEFAULT_ADMIN_EMAIL in .env to your own address."
    echo "    The API container will not start in production until it is set."
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
if $changed; then
    echo "==> Secrets written to .env"
    echo "    Review DEPLOY_MODE and host settings before running deploy.sh."
    echo "    The first admin password is DEFAULT_ADMIN_PASSWORD in .env — sign in with it, then keep it safe."
else
    echo "==> All secrets already set. No changes made."
fi
