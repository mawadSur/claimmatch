#!/usr/bin/env bash
# Apply every migration from scratch on a disposable PostgreSQL database, then
# run the SQL tests in supabase/tests/ (files 10_*.sql and up).
#
#   DATABASE_URL=postgres://postgres@localhost:5432/postgres scripts/db-test.sh
#
# Never point this at a real Supabase project: it creates stub roles and an
# auth schema, and tests write rows.
set -euo pipefail

: "${DATABASE_URL:?Set DATABASE_URL to a disposable database}"
case "$DATABASE_URL" in
  *supabase.co*|*supabase.com*|*pooler.supabase*)
    echo "Refusing to run against a Supabase host: $DATABASE_URL" >&2
    exit 1 ;;
esac

cd "$(dirname "$0")/.."
export PGOPTIONS="${PGOPTIONS:--c client_min_messages=warning}"
run() { psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -X "$@"; }

run -f supabase/tests/00_auth_stub.sql
for f in supabase/migrations/*.sql; do
  echo "migrate  $f"
  run -f "$f"
done
for f in supabase/tests/[1-9]*.sql; do
  [ -e "$f" ] || continue
  echo "test     $f"
  run -f "$f"
done
echo "db-test: all migrations applied and all SQL tests passed"
