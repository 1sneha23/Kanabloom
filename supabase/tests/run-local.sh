#!/usr/bin/env bash
# Spins up a throwaway PostgreSQL, applies the Supabase stub + all migrations + seed,
# then runs the security and logic test suite. Requires PostgreSQL 15+ binaries on PATH
# (or under /usr/lib/postgresql/<ver>/bin). Exits non-zero on any failed assertion.
set -euo pipefail
cd "$(dirname "$0")/../.."
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
export PATH="$PGBIN:$PATH"
TMP="$(mktemp -d)"; PORT="${PGPORT_TEST:-54329}"
# PostgreSQL refuses to run as root; drop to the "postgres" OS user when needed.
AS=(); if [ "$(id -u)" = "0" ]; then AS=(runuser -u postgres --); chown postgres "$TMP"; fi
trap '"${AS[@]}" env PATH="$PATH" pg_ctl -D "$TMP/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$TMP"' EXIT
"${AS[@]}" env PATH="$PATH" initdb -D "$TMP/data" -U postgres -E UTF8 --locale=C.UTF-8 >/dev/null
"${AS[@]}" env PATH="$PATH" pg_ctl -D "$TMP/data" -o "-p $PORT -k $TMP -c listen_addresses=''" -l "$TMP/log" -w start >/dev/null
PSQL=(psql -h "$TMP" -p "$PORT" -U postgres -v ON_ERROR_STOP=1 -q -X)
"${PSQL[@]}" -c "create database kanabloom" postgres
run() { "${PSQL[@]}" -d kanabloom -o /dev/null -f "$1" 2>&1 | sed -e "s/^psql:[^ ]* NOTICE:  /  /"; return "${PIPESTATUS[0]}"; }
run supabase/tests/supabase_stub.sql
for f in supabase/migrations/*.sql; do echo "migrate: $f"; run "$f"; done
echo "seed: supabase/seed.sql"; run supabase/seed.sql
echo "tests: supabase/tests/security_test.sql"
run supabase/tests/security_test.sql
echo "ALL DATABASE TESTS PASSED"
