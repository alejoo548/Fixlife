#!/usr/bin/env bash
# Starts/refreshes free cloudflared quick tunnels so Wompi checkout (which
# rejects any localhost URL in its redirect/webhook fields) can be tested from
# local dev. Rewrites the relevant .env vars and restarts the affected
# containers to pick them up. Quick tunnel URLs are NOT stable across restarts
# of this script — re-run it whenever you want to test Wompi again.
#
# Usage:
#   ./scripts/wompi-tunnel.sh start    # start/refresh tunnels, patch .env, restart containers
#   ./scripts/wompi-tunnel.sh stop     # kill tunnels, revert .env to localhost
#   ./scripts/wompi-tunnel.sh status   # show current tunnel URLs, if any

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT_DIR/.env"
RUN_DIR="$ROOT_DIR/.wompi-tunnel"
BACKEND_LOG="$RUN_DIR/backend.log"
FRONTEND_LOG="$RUN_DIR/frontend.log"
BACKEND_PID_FILE="$RUN_DIR/backend.pid"
FRONTEND_PID_FILE="$RUN_DIR/frontend.pid"
CLOUDFLARED="${CLOUDFLARED_BIN:-cloudflared}"

mkdir -p "$RUN_DIR"

require_cloudflared() {
  if ! command -v "$CLOUDFLARED" >/dev/null 2>&1; then
    echo "cloudflared not found. Install it first (e.g. download the binary from" >&2
    echo "https://github.com/cloudflare/cloudflared/releases and put it on your PATH)." >&2
    exit 1
  fi
}

pid_alive() {
  local pid_file="$1"
  [[ -f "$pid_file" ]] && kill -0 "$(cat "$pid_file")" 2>/dev/null
}

wait_for_url() {
  local log_file="$1"
  local attempt=0
  local url=""
  while [[ $attempt -lt 30 ]]; do
    url=$(grep -oE 'https://[a-zA-Z0-9-]+\.trycloudflare\.com' "$log_file" 2>/dev/null | head -n1 || true)
    if [[ -n "$url" ]]; then
      echo "$url"
      return 0
    fi
    sleep 1
    attempt=$((attempt + 1))
  done
  echo "Timed out waiting for a tunnel URL in $log_file" >&2
  return 1
}

start_tunnel() {
  local target_port="$1"
  local log_file="$2"
  local pid_file="$3"

  if pid_alive "$pid_file"; then
    local existing_url
    existing_url=$(grep -oE 'https://[a-zA-Z0-9-]+\.trycloudflare\.com' "$log_file" 2>/dev/null | head -n1 || true)
    if [[ -n "$existing_url" ]]; then
      echo "$existing_url"
      return 0
    fi
  fi

  : > "$log_file"
  nohup "$CLOUDFLARED" tunnel --url "http://localhost:${target_port}" >"$log_file" 2>&1 &
  echo $! > "$pid_file"
  wait_for_url "$log_file"
}

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

cmd_start() {
  require_cloudflared

  echo "Starting/checking cloudflared tunnels..."
  local backend_url frontend_url
  backend_url=$(start_tunnel 8000 "$BACKEND_LOG" "$BACKEND_PID_FILE")
  frontend_url=$(start_tunnel 3000 "$FRONTEND_LOG" "$FRONTEND_PID_FILE")

  echo "Backend tunnel:  $backend_url"
  echo "Frontend tunnel: $frontend_url"

  echo "Updating .env..."
  set_env_var "PUBLIC_API_ORIGIN" "$backend_url"
  set_env_var "PUBLIC_APP_URL" "$frontend_url"
  set_env_var "VITE_API_URL" "${backend_url}/api"

  local allowed
  allowed=$(grep '^ALLOWED_ORIGINS=' "$ENV_FILE" | cut -d= -f2- || true)
  if [[ "$allowed" != *"$frontend_url"* ]]; then
    set_env_var "ALLOWED_ORIGINS" "${allowed:+$allowed,}${frontend_url}"
  fi

  echo "Rebuilding frontend (VITE_API_URL is baked in at build time) and restarting backend..."
  (cd "$ROOT_DIR" && docker compose build frontend >/dev/null && docker compose up -d frontend backend)

  cat <<EOF

Wompi tunnel ready.
  Open:            $frontend_url
  Backend webhook:  reachable at $backend_url (used automatically by checkout creation)

Regular local dev at http://localhost:3000 still works exactly as before —
these tunnels only matter for the redirect/webhook URLs sent to Wompi.
Run './scripts/wompi-tunnel.sh stop' when you're done to revert to localhost-only.
EOF
}

cmd_stop() {
  echo "Stopping tunnels..."
  for pid_file in "$BACKEND_PID_FILE" "$FRONTEND_PID_FILE"; do
    if pid_alive "$pid_file"; then
      kill "$(cat "$pid_file")" 2>/dev/null || true
    fi
    rm -f "$pid_file"
  done

  echo "Reverting .env to localhost..."
  set_env_var "PUBLIC_API_ORIGIN" "http://127.0.0.1:8000"
  set_env_var "PUBLIC_APP_URL" "http://127.0.0.1:3000"
  set_env_var "VITE_API_URL" "http://127.0.0.1:8000/api"

  echo "Rebuilding frontend and restarting backend with localhost settings..."
  (cd "$ROOT_DIR" && docker compose build frontend >/dev/null && docker compose up -d frontend backend)
  echo "Done. Back to localhost-only."
}

cmd_status() {
  local any=0
  if pid_alive "$BACKEND_PID_FILE"; then
    any=1
    echo "Backend tunnel running:  $(grep -oE 'https://[a-zA-Z0-9-]+\.trycloudflare\.com' "$BACKEND_LOG" 2>/dev/null | head -n1)"
  fi
  if pid_alive "$FRONTEND_PID_FILE"; then
    any=1
    echo "Frontend tunnel running: $(grep -oE 'https://[a-zA-Z0-9-]+\.trycloudflare\.com' "$FRONTEND_LOG" 2>/dev/null | head -n1)"
  fi
  if [[ "$any" -eq 0 ]]; then
    echo "No tunnels running."
  fi
}

case "${1:-}" in
  start) cmd_start ;;
  stop) cmd_stop ;;
  status) cmd_status ;;
  *)
    echo "Usage: $0 {start|stop|status}" >&2
    exit 1
    ;;
esac
