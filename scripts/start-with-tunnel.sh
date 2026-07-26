#!/usr/bin/env bash
# One-command start for running Fixlife "in production" behind a Cloudflare
# quick tunnel (e.g. on a Raspberry Pi). Quick tunnel URLs are random and
# change every time the cloudflared container restarts — this script starts
# the whole stack, waits for the fresh https://*.trycloudflare.com URL,
# writes it into .env (PUBLIC_API_ORIGIN, PUBLIC_APP_URL, ALLOWED_ORIGINS),
# and recreates the backend so it picks up the new value. No manual .env
# editing needed on any restart.
#
# The frontend does NOT need a rebuild when the tunnel URL changes: it
# already detects it's being accessed from a non-local host and calls its
# own current origin for the API (see src/config/api.ts), which nginx
# proxies to the backend on the same origin. Only PUBLIC_API_ORIGIN /
# PUBLIC_APP_URL (used server-side for Wompi/PayPal redirect+webhook URLs,
# which the browser never touches) and CORS need the fresh value.
#
# Usage:
#   ./scripts/start-with-tunnel.sh            # start everything + sync tunnel URL
#   ./scripts/start-with-tunnel.sh --no-build  # skip "docker compose build", just up -d

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT_DIR/.env"
cd "$ROOT_DIR"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "No .env found at $ENV_FILE — copy .env.example to .env and fill it in first." >&2
  exit 1
fi

set_env_var() {
  local key="$1"
  local value="$2"
  local escaped
  escaped=$(printf '%s' "$value" | sed -e 's/[\/&]/\\&/g')
  if grep -q "^${key}=" "$ENV_FILE"; then
    sed -i "s#^${key}=.*#${key}=${escaped}#" "$ENV_FILE"
  else
    echo "${key}=${value}" >> "$ENV_FILE"
  fi
}

get_env_var() {
  local key="$1"
  grep "^${key}=" "$ENV_FILE" 2>/dev/null | head -n1 | cut -d= -f2- || true
}

# Replace any previously-recorded trycloudflare.com origin in ALLOWED_ORIGINS
# with the fresh one, keeping every other origin (localhost dev ports, etc.)
sync_allowed_origins() {
  local new_url="$1"
  local current
  current=$(get_env_var ALLOWED_ORIGINS)
  local kept=""
  IFS=',' read -ra parts <<< "$current"
  for part in "${parts[@]}"; do
    part="$(echo "$part" | xargs)"
    [[ -z "$part" ]] && continue
    [[ "$part" == *".trycloudflare.com" ]] && continue
    kept="${kept:+$kept,}$part"
  done
  kept="${kept:+$kept,}$new_url"
  set_env_var "ALLOWED_ORIGINS" "$kept"
}

if [[ "${1:-}" != "--no-build" ]]; then
  echo "==> Building images..."
  docker compose build
fi

echo "==> Starting the stack (db, backend, frontend, nginx, tunnel)..."
docker compose up -d

echo "==> Waiting for the Cloudflare tunnel to hand out a URL..."
TUNNEL_URL=""
for _ in $(seq 1 60); do
  TUNNEL_URL=$(docker compose logs cloudflared --no-color 2>/dev/null \
    | grep -oE 'https://[a-zA-Z0-9-]+\.trycloudflare\.com' | tail -n1 || true)
  [[ -n "$TUNNEL_URL" ]] && break
  sleep 1
done

if [[ -z "$TUNNEL_URL" ]]; then
  echo "Timed out waiting for a tunnel URL. Check: docker compose logs cloudflared" >&2
  exit 1
fi

echo "==> Tunnel URL: $TUNNEL_URL"

CURRENT_ORIGIN=$(get_env_var PUBLIC_API_ORIGIN)
if [[ "$CURRENT_ORIGIN" == "$TUNNEL_URL" ]]; then
  echo "==> .env already points at this tunnel URL, nothing to update."
else
  echo "==> Updating .env with the fresh tunnel URL..."
  set_env_var "PUBLIC_API_ORIGIN" "$TUNNEL_URL"
  set_env_var "PUBLIC_APP_URL" "$TUNNEL_URL"
  sync_allowed_origins "$TUNNEL_URL"

  echo "==> Restarting backend so it picks up the new .env..."
  docker compose up -d --force-recreate backend
fi

cat <<EOF

Ready.
  App (through the tunnel): $TUNNEL_URL
  Local:                    http://localhost:3000

Note: cloudflared quick tunnels hand out a NEW random URL every time that
container restarts (crash, reboot, "docker compose restart cloudflared",
etc.) — just re-run this script afterwards and it'll re-sync everything.
For a URL that never changes across restarts, you need a named Cloudflare
Tunnel tied to a domain you own — ask if you want that set up instead.
EOF
