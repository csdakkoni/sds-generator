#!/usr/bin/env bash
# Applies the migrations to a throwaway local Postgres database and runs the RLS tests.
# Needs psql and a server reachable with the standard PG* environment variables.
set -euo pipefail
cd "$(dirname "$0")/.."
db="sds_rls_test_$$"
psql -v ON_ERROR_STOP=1 -q -d postgres -c "create database $db"
trap 'psql -q -d postgres -c "drop database if exists $db" >/dev/null' EXIT
run() { psql -v ON_ERROR_STOP=1 -q -X -d "$db" "$@"; }
run -f tests/local-auth-shim.sql
for f in migrations/*.sql; do run -f "$f"; done
for f in tests/rls.test.sql tests/storage.test.sql tests/library.test.sql; do
  echo "== $f"
  run -o /dev/null -f "$f" 2>&1 | sed -E "s/^psql:[^ ]+ NOTICE:  //"
done
echo "All database tests passed."
