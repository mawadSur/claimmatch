#!/usr/bin/env bash
# Apply every migration from scratch on a disposable PostgreSQL database, then
# run every SQL test in supabase/tests/ in name order (all files except the
# 00_auth_stub.sql setup). Stops at the first error or failed assertion and
# exits non-zero.
#
#   DATABASE_URL=postgres://postgres@localhost:5432/postgres scripts/db-test.sh
#
# Each migration file runs in a single transaction, the way `supabase db push`
# and the Supabase SQL editor run it. So a file that adds an enum value and
# then uses it fails here as it would in production.
#
# Never point this at a real database: it replaces auth.uid() and auth.role(),
# creates cluster-wide roles, and tests write and delete rows. So it runs only
# against a server on this machine (localhost, 127.0.0.1 or [::1], or a local
# socket), never against a Supabase host, and never on a database whose
# public.lawsuits already has rows. For a disposable database on another host
# (for example a CI service container reached by name), set
# DB_TEST_ALLOW_REMOTE=1.
set -euo pipefail

: "${DATABASE_URL:?Set DATABASE_URL to a disposable database}"
# The URL may hold a password, so it is never echoed.
db_url=$(printf '%s' "$DATABASE_URL" | tr '[:upper:]' '[:lower:]')
case "$db_url" in
  *supabase.co*|*supabase.com*|*pooler.supabase*)
    echo "Refusing to run against a Supabase host. Point DATABASE_URL at a disposable database." >&2
    exit 1 ;;
esac

# Prints each host named in a postgres:// or postgresql:// URL, one per line
# (nothing when the URL names none, which means the local socket). Fails for
# any other form, such as a key=value string or a service name, and for a URL
# whose query string names a host or service, so those are refused below.
url_hosts() {
  local rest authority h
  case "$1" in
    postgres://*|postgresql://*) rest=${1#*://} ;;
    *) return 1 ;;
  esac
  case "$rest" in
    *\?*host=*|*\?*hostaddr=*|*\?*service=*) return 1 ;;
  esac
  authority=${rest%%[/?]*}
  authority=${authority##*@}
  [ -n "$authority" ] || return 0
  local -a hosts_in_url
  IFS=, read -r -a hosts_in_url <<< "$authority"
  for h in "${hosts_in_url[@]}"; do
    case "$h" in
      \[*\]*) h=${h#\[}; h=${h%%\]*} ;;
      *) h=${h%%:*} ;;
    esac
    printf '%s\n' "$h"
  done
}

if [ "${DB_TEST_ALLOW_REMOTE:-}" != 1 ]; then
  if ! hosts=$(url_hosts "$db_url"); then
    echo "Refusing to run: DATABASE_URL must be a postgres:// or postgresql:// URL for a server on this machine (set DB_TEST_ALLOW_REMOTE=1 for a disposable remote database)." >&2
    exit 1
  fi
  while IFS= read -r h; do
    case "$h" in
      ''|localhost|127.0.0.1|::1|/*|%2f*) ;;
      *)
        echo "Refusing to run against host '$h': only localhost, 127.0.0.1 or [::1] (set DB_TEST_ALLOW_REMOTE=1 for a disposable remote database)." >&2
        exit 1 ;;
    esac
  done <<< "$hosts"
fi
# Only the URL decides where psql connects.
unset PGHOST PGHOSTADDR PGSERVICE PGSERVICEFILE
command -v psql >/dev/null || { echo "psql not found: install the PostgreSQL client" >&2; exit 1; }

cd "$(dirname "$0")/.."
export PGOPTIONS="${PGOPTIONS:--c client_min_messages=warning}"
run() { psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -X "$@"; }

# A database that already lists settlements is not a disposable one.
if [ "$(run -At -c "select to_regclass('public.lawsuits') is not null")" = t ] &&
   [ "$(run -At -c 'select exists (select 1 from public.lawsuits)')" = t ]; then
  echo "Refusing to run: public.lawsuits already has rows, so this is not an empty, disposable database. Create a new one." >&2
  exit 1
fi

server_version=$(run -At -c 'show server_version')
echo "db-test: PostgreSQL $server_version"
run -f supabase/tests/00_auth_stub.sql
for f in supabase/migrations/*.sql; do
  echo "migrate  $f"
  run --single-transaction -f "$f"
done
for f in supabase/tests/*.sql; do
  [ -e "$f" ] || continue
  [ "$(basename "$f")" = 00_auth_stub.sql ] && continue
  echo "test     $f"
  run -f "$f"
done
echo "db-test: all migrations applied and all SQL tests passed"
