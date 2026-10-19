#!/usr/bin/env bash
# Base de dados de teste para o backoffice (uso: PGHOST/PGUSER/PGPASSWORD definidos; cria a base "e2e")
set -euo pipefail
cd "$(dirname "$0")"
MIG=../../supabase/migrations; FIX=../db/fixtures
psql -q -v ON_ERROR_STOP=1 -d postgres -c "drop database if exists e2e" -c "create database e2e" >/dev/null
P="psql -q -v ON_ERROR_STOP=1 -d e2e"
$P -f ../db/_supabase_stub.sql >/dev/null
for f in $(ls $MIG/*.sql | sort); do $P -f "$f" >/dev/null; done
$P <<'SQL'
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticator') then create role authenticator login password 'x' noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
end $$;
grant anon, authenticated, service_role to authenticator;
grant usage on schema public, auth, extensions, storage to anon, authenticated, service_role;
grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
grant execute on all functions in schema public to anon, authenticated, service_role;
SQL
$P -v catalog="$(cat $FIX/catalog.json)" -v customers="$(cat $FIX/customers.json)" -f seed.sql >/dev/null
echo "base e2e pronta"
