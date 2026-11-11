#!/usr/bin/env bash
# Isolated authenticated Playwright journey. Never production, never real email.
# Starts a loopback GoTrue/PostgREST fixture, builds Next against it, and
# drives the real UI. Not a production E2E.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if command -v docker >/dev/null 2>&1 && command -v supabase >/dev/null 2>&1; then
  echo "note: Docker/Supabase CLI exist, but this runner still uses the isolated fixture (no production project)."
fi

HOST="${ISOLATED_BACKEND_HOST:-127.0.0.1}"
BACKEND_PORT="${ISOLATED_BACKEND_PORT:-54321}"
APP_PORT="${ISOLATED_APP_PORT:-3010}"
ARTIFACTS="${ARTIFACTS_DIR:-/opt/cursor/artifacts}"
mkdir -p "$ARTIFACTS"

if [[ "$HOST" != "127.0.0.1" && "$HOST" != "localhost" && "$HOST" != "::1" ]]; then
  echo "refusing non-loopback isolated backend host: $HOST" >&2
  exit 1
fi

ANON_KEY='eyJhbGciOiJub25lIn0.eyJyb2xlIjoiYW5vbiIsImlzcyI6Imlzb2xhdGVkLWZpeHR1cmUifQ.isolated'
SERVICE_KEY='eyJhbGciOiJub25lIn0.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoiaXNvbGF0ZWQtZml4dHVyZSJ9.isolated'
SUPABASE_URL="http://${HOST}:${BACKEND_PORT}"

if [[ "$SUPABASE_URL" == *supabase.co* || "$SUPABASE_URL" == *lawsuitai.org* ]]; then
  echo "refusing to point the isolated runner at a real host" >&2
  exit 1
fi

port_busy() {
  local port="$1"
  python3 - "$port" <<'PY'
import socket, sys
port = int(sys.argv[1])
s = socket.socket()
s.settimeout(0.3)
try:
    s.connect(("127.0.0.1", port))
except OSError:
    raise SystemExit(1)
finally:
    s.close()
raise SystemExit(0)
PY
}

if port_busy "$BACKEND_PORT"; then
  echo "isolated backend port $BACKEND_PORT is already in use; refusing to attach to a stale process" >&2
  exit 1
fi
if port_busy "$APP_PORT"; then
  echo "isolated app port $APP_PORT is already in use; refusing to attach to a stale process" >&2
  exit 1
fi

export HOST BACKEND_PORT
export NEXT_TELEMETRY_DISABLED=1
export NEXT_PUBLIC_SUPABASE_URL="$SUPABASE_URL"
export NEXT_PUBLIC_SUPABASE_ANON_KEY="$ANON_KEY"
export SUPABASE_SERVICE_ROLE_KEY="$SERVICE_KEY"
export NEXT_PUBLIC_POSTHOG_KEY='phc_isolated_fixture_not_production'
export NEXT_PUBLIC_POSTHOG_HOST="http://127.0.0.1:${APP_PORT}"
export NEXT_PUBLIC_SITE_URL="http://127.0.0.1:${APP_PORT}"
export ISOLATED_JOURNEY=1
export PLAYWRIGHT_BASE_URL="http://127.0.0.1:${APP_PORT}"
export ARTIFACTS_DIR="$ARTIFACTS"
# Production product flags stay off: live beta, self-file only.
unset FEE_DISCLOSURE_ENABLED ASSISTED_FILING_ENABLED PROFILE_V2_ENABLED MATCH_STORE_ENABLED HOME_ACCOUNT_FIRST_CTA || true
# Isolated-only: verify panel-objection UI. Production leaves these unset.
export PANEL_TRUST_COPY_ENABLED=1
export CATALOG_VALUE_RANK_ENABLED=1
export SETTLEMENT_QUIZ_ENABLED=1
# Leftover catalog "Unknown" omission. Production leaves this unset.
export CATALOG_HIDE_UNKNOWNS_ENABLED=1
# Soft-beta invite/feedback stay off: the fixture has no beta_feedback table.
unset BETA_INVITE_CODES_ENABLED BETA_FEEDBACK_ENABLED || true
# After-you-file flags stay off: production leaves these unset.
unset CLAIM_TIMELINE_ENABLED PAYOUT_TRACKER_EMAILS_ENABLED MATCH_REASON_ENABLED TRUST_SCORECARD_ENABLED || true

PIDS=()
cleanup() {
  local pid
  for pid in "${PIDS[@]+"${PIDS[@]}"}"; do
    kill "$pid" 2>/dev/null || true
  done
}
trap cleanup EXIT

wait_http() {
  local url="$1"
  local i
  for i in $(seq 1 90); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  echo "timed out waiting for $url" >&2
  return 1
}

node "$ROOT/scripts/isolated-backend.mjs" >"$ARTIFACTS/isolated-backend.log" 2>&1 &
PIDS+=($!)
wait_http "http://${HOST}:${BACKEND_PORT}/__isolated/health"

echo "isolated fixture up at $SUPABASE_URL"

# Public NEXT_* values are inlined at build time; this second build is only
# for the isolated app and must not use production secrets.
npm run build

npx next start --hostname 127.0.0.1 --port "$APP_PORT" >"$ARTIFACTS/isolated-next.log" 2>&1 &
PIDS+=($!)
wait_http "http://127.0.0.1:${APP_PORT}/"

npx playwright test e2e/isolated e2e/journey-public.spec.ts --reporter=list
echo "isolated journey finished (fixture + real UI; not production E2E)"
