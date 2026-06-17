#!/usr/bin/env bash
set -euo pipefail

# Run from anywhere — always resolves to the project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ── .env check ────────────────────────────────────────────────────────────────
if [[ ! -f .env ]]; then
    echo "Error: .env not found in $SCRIPT_DIR" >&2
    exit 1
fi

# Read DEPLOY_MODE (strips optional surrounding quotes)
DEPLOY_MODE=$(grep -E '^DEPLOY_MODE=' .env | head -1 | cut -d '=' -f2- | tr -d '"'"'"'[:space:]')

if [[ -z "$DEPLOY_MODE" ]]; then
    echo "Error: DEPLOY_MODE is not set in .env" >&2
    echo "       Valid values: api-only | with-db" >&2
    exit 1
fi

# ── Git pull (fast-forward only) ──────────────────────────────────────────────
echo "==> Fetching latest changes..."
git fetch origin

CURRENT_BRANCH=$(git symbolic-ref --short HEAD)
echo "==> Merging origin/$CURRENT_BRANCH (fast-forward only)..."
git merge --ff-only "origin/$CURRENT_BRANCH"

# ── Copy deployment configs into project root ─────────────────────────────────
echo "==> Applying deployment config: $DEPLOY_MODE"

case "$DEPLOY_MODE" in
  with-db)
    cp -f deployment/db/docker-compose.yml ./docker-compose.yml
    cp -f deployment/db/Dockerfile ./Dockerfile
    cp -f deployment/db/init.sh ./init.sh
    chmod +x ./init.sh
    ;;
  api-only)
    cp -f deployment/no-db-no-redis/docker-compose.yml ./docker-compose.yml
    cp -f deployment/no-db-no-redis/Dockerfile ./Dockerfile
    rm -f ./init.sh  # remove stale file if switching from with-db
    ;;
  *)
    echo "Error: Invalid DEPLOY_MODE '$DEPLOY_MODE'" >&2
    echo "       Valid values: api-only | with-db" >&2
    exit 1
    ;;
esac

# ── Build and restart containers ──────────────────────────────────────────────
echo "==> Pulling latest base images..."
docker compose pull --ignore-buildable

echo "==> Building and restarting containers..."
docker compose up -d --build --remove-orphans

echo ""
echo "==> Deployment complete. Running containers:"
docker compose ps
