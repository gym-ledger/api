#!/usr/bin/env bash
# One-time server setup for deploys from GitHub Actions
# (.github/workflows/deploy.yml in each of the three repos). Run as root:
#
#   bash deployment/ci/setup-server.sh --host <IP or hostname GitHub connects to> \
#       [--environment production|qa] [--port 22] [--api DIR] [--app DIR] [--admin DIR]
#
# The repo folders default to this repo and its siblings web and admin.
# --environment is the GitHub environment this server deploys: production
# (the default) deploys main, qa deploys the qa branch. A server deploys the
# branch its repo folders are checked out on, so they must be on that branch.
# Re-running is safe; it makes new keys, so the
# DEPLOY_SSH_KEY secrets in GitHub must then be updated too.
#
# What it sets up:
#   - a "deploy" user with no password and no shell over SSH: each of its
#     keys is pinned (authorized_keys command=) to deploying one repo and can
#     only send a commit id (see workout-gym-deploy-ssh)
#   - sudo for exactly /usr/local/sbin/workout-gym-deploy, which runs that
#     repo's deploy.sh as root, one deploy at a time
#   - one SSH key per repo; each private key is shown once for you to paste
#     into GitHub, then deleted from this server
set -euo pipefail

[[ $EUID -eq 0 ]] || { echo "Run this as root." >&2; exit 1; }

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
API_DIR="$(cd "$HERE/../.." && pwd)"
APP_DIR="$(dirname "$API_DIR")/web"
ADMIN_DIR="$(dirname "$API_DIR")/admin"
HOST=""
PORT=22
ENVIRONMENT=production
DEPLOY_USER=deploy

while [[ $# -gt 0 ]]; do
    case "$1" in
        --host) HOST="${2:-}"; shift 2 ;;
        --port) PORT="${2:-}"; shift 2 ;;
        --environment) ENVIRONMENT="${2:-}"; shift 2 ;;
        --api) API_DIR="${2:-}"; shift 2 ;;
        --app) APP_DIR="${2:-}"; shift 2 ;;
        --admin) ADMIN_DIR="${2:-}"; shift 2 ;;
        *) echo "Unknown option: $1" >&2; exit 1 ;;
    esac
done
[[ -n "$HOST" ]] || { echo "Pass --host <the IP or hostname GitHub should connect to>" >&2; exit 1; }
[[ "$PORT" =~ ^[0-9]+$ ]] || { echo "--port must be a number" >&2; exit 1; }
case "$ENVIRONMENT" in
    production) BRANCH=main ;;
    qa) BRANCH=qa ;;
    *) echo "--environment must be production or qa" >&2; exit 1 ;;
esac

TARGETS=(api app admin)
declare -A DIRS=([api]="$API_DIR" [app]="$APP_DIR" [admin]="$ADMIN_DIR")
declare -A REPOS=([api]=gym-ledger/api [app]=gym-ledger/web [admin]=gym-ledger/admin)

echo "==> Repo folders"
for t in "${TARGETS[@]}"; do
    d="${DIRS[$t]}"
    if [[ ! -f "$d/deploy.sh" || ! -d "$d/.git" ]]; then
        echo "  $t: no git repo with deploy.sh in $d. Pass --$t <folder>." >&2
        exit 1
    fi
    branch="$(git -C "$d" symbolic-ref --short HEAD)"
    echo "  $t: $d (branch $branch)"
    if [[ "$branch" != "$BRANCH" ]]; then
        echo "  $t is on $branch, but $ENVIRONMENT deploys $BRANCH: git -C $d checkout $BRANCH" >&2
        exit 1
    fi
done

echo "==> Can the server fetch from GitHub on its own (without your SSH session)?"
fetch_failed=()
for t in "${TARGETS[@]}"; do
    if env -u SSH_AUTH_SOCK GIT_TERMINAL_PROMPT=0 GIT_SSH_COMMAND="ssh -o BatchMode=yes" \
        git -C "${DIRS[$t]}" fetch --quiet origin 2>/dev/null; then
        echo "  $t: yes"
    else
        echo "  $t: NO"
        fetch_failed+=("$t")
    fi
done

echo "==> Installing the deploy scripts"
install -o root -g root -m 755 "$HERE/workout-gym-deploy" /usr/local/sbin/workout-gym-deploy
install -o root -g root -m 755 "$HERE/workout-gym-deploy-ssh" /usr/local/sbin/workout-gym-deploy-ssh
umask 077
{
    echo "# Repo folders for /usr/local/sbin/workout-gym-deploy (written by setup-server.sh)"
    for t in "${TARGETS[@]}"; do echo "$t=${DIRS[$t]}"; done
} > /etc/workout-gym-deploy.conf
chmod 600 /etc/workout-gym-deploy.conf

echo "==> User '$DEPLOY_USER'"
if ! id "$DEPLOY_USER" &>/dev/null; then
    useradd --create-home --shell /bin/bash "$DEPLOY_USER"
fi
# '*' = no password can ever match; SSH keys still work.
usermod -p '*' "$DEPLOY_USER"
home="$(getent passwd "$DEPLOY_USER" | cut -d: -f6)"

sudoers_tmp="$(mktemp)"
echo "$DEPLOY_USER ALL=(root) NOPASSWD: /usr/local/sbin/workout-gym-deploy" > "$sudoers_tmp"
visudo -cqf "$sudoers_tmp"
install -o root -g root -m 440 "$sudoers_tmp" /etc/sudoers.d/workout-gym-deploy
rm -f "$sudoers_tmp"

echo "==> SSH keys (one per repo)"
keydir="$(mktemp -d)"
trap 'rm -rf "$keydir"' EXIT
install -d -o "$DEPLOY_USER" -g "$DEPLOY_USER" -m 700 "$home/.ssh"
for t in "${TARGETS[@]}"; do
    ssh-keygen -q -t ed25519 -N "" -C "github-actions-deploy-$t" -f "$keydir/$t"
    echo "restrict,command=\"/usr/local/sbin/workout-gym-deploy-ssh $t\" $(cat "$keydir/$t.pub")"
done > "$keydir/authorized_keys"
install -o "$DEPLOY_USER" -g "$DEPLOY_USER" -m 600 "$keydir/authorized_keys" "$home/.ssh/authorized_keys"

if sshd -T 2>/dev/null | grep -Eiq '^(allowusers|allowgroups) '; then
    echo
    echo "  WARNING: sshd only lets listed users in (AllowUsers/AllowGroups in /etc/ssh/sshd_config)."
    echo "  Add '$DEPLOY_USER' there, then: systemctl reload ssh"
fi

host_pattern="$HOST"
[[ "$PORT" == 22 ]] || host_pattern="[$HOST]:$PORT"
known_hosts="$(for f in /etc/ssh/ssh_host_*_key.pub; do echo "$host_pattern $(cut -d' ' -f1,2 "$f")"; done)"

echo
echo "Next, for each repo you'll see 4 values to save in GitHub. Each private key"
echo "is shown once and deleted from this server afterwards."
read -rp "Press Enter to show the first one... " _

for t in "${TARGETS[@]}"; do
    clear 2>/dev/null || true
    cat <<EOF
================ ${REPOS[$t]} ================
GitHub: ${REPOS[$t]} > Settings > Environments > $ENVIRONMENT > Environment secrets

DEPLOY_HOST
$HOST

DEPLOY_PORT
$PORT

DEPLOY_KNOWN_HOSTS (all of these lines)
$known_hosts

DEPLOY_SSH_KEY (everything below, including the BEGIN and END lines)
$(cat "$keydir/$t")

EOF
    read -rp "Saved all 4 in ${REPOS[$t]}? Press Enter to continue... " _
done
clear 2>/dev/null || true

echo "==> Done. The private keys are deleted from this server."
if [[ ${#fetch_failed[@]} -gt 0 ]]; then
    cat <<EOF

The server couldn't fetch these repos from GitHub by itself: ${fetch_failed[*]}
Deploys will fail at 'git fetch' until it can. Most likely your manual deploys
used your own SSH key forwarded from your computer. Fix: add a read-only
deploy key to each of those repos (GitHub > repo > Settings > Deploy keys),
or, once the repos are public, switch the remote to https:
  git -C <folder> remote set-url origin https://github.com/gym-ledger/<repo>.git
Then re-run this script to check (it makes new keys, so update DEPLOY_SSH_KEY).
EOF
fi
