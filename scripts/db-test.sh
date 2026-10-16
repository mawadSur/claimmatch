#!/usr/bin/env bash
# Apply every migration from scratch on a disposable PostgreSQL database, then
# run the SQL tests in supabase/tests/ (files 10_*.sql and up). Stops at the
# first error or failed assertion and exits non-zero.
#
#   DATABASE_URL=postgres://postgres@localhost:5432/postgres scripts/db-test.sh
#
# Each migration file runs in a single transaction, the way `supabase db push`
# and the Supabase SQL editor run it. So a file that adds an enum value and
# then uses it fails here as it would in production.
#
# Never point this at a real Supabase project: it creates stub roles and an
# auth schema, and tests write rows.
set -euo pipefail

: "${DATABASE_URL:?Set DATABASE_URL to a disposable database}"
case "$DATABASE_URL" in
  *supabase.co*|*supabase.com*|*pooler.supabase*)
    # The URL may hold a password, so it is not echoed.
    echo "Refusing to run against a Supabase host. Point DATABASE_URL at a disposable database." >&2
    exit 1 ;;
esac
command -v psql >/dev/null || { echo "psql not found: install the PostgreSQL client" >&2; exit 1; }

cd "$(dirname "$0")/.."
export PGOPTIONS="${PGOPTIONS:--c client_min_messages=warning}"
run() { psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -X "$@"; }

server_version=$(run -At -c 'show server_version')
echo "db-test: PostgreSQL $server_version"
run -f supabase/tests/00_auth_stub.sql
for f in supabase/migrations/*.sql; do
  echo "migrate  $f"
  run --single-transaction -f "$f"
done
for f in supabase/tests/[1-9]*.sql; do
  [ -e "$f" ] || continue
  echo "test     $f"
  run -f "$f"
done
echo "db-test: all migrations applied and all SQL tests passed"
