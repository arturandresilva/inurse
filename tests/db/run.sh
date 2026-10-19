#!/usr/bin/env bash
# Corre os testes da base de dados num Postgres limpo (uso: PGHOST/PGUSER definidos)
set -euo pipefail
cd "$(dirname "$0")"
MIG=../../supabase/migrations
CAT="$(cat fixtures/catalog.json)"; CUS="$(cat fixtures/customers.json)"
fail=0
fresh() {
  psql -q -v ON_ERROR_STOP=1 -d postgres -c "drop database if exists t" -c "create database t" >/dev/null
  psql -q -v ON_ERROR_STOP=1 -d t -f _supabase_stub.sql >/dev/null
  for f in $(ls $MIG/*.sql | sort); do psql -q -v ON_ERROR_STOP=1 -d t -f "$f" >/dev/null 2>"/tmp/mig.err" || { echo "FALHOU migração $f"; cat /tmp/mig.err; exit 1; }; done
}
run() {
  local name=$1; shift
  out=$(psql -v ON_ERROR_STOP=1 -d t -v catalog="$CAT" -v customers="$CUS" "$@" 2>&1) || { echo "✗ $name"; echo "$out" | tail -20; fail=1; return; }
  if echo "$out" | grep -qE "NOTICE:  ERRO|ERROR:"; then echo "✗ $name"; echo "$out" | grep -E "ERRO|ERROR" | head; fail=1; else echo "✓ $name"; fi
}
fresh; run "núcleo: preços, importação, checkout" -f v2_core_test.sql; run "agentes e propostas" -f agents_test.sql
fresh; psql -q -d t -c "insert into auth.users(id,email) values ('00000000-0000-0000-0000-000000000001','artur.impact@gmail.com')"; run "finanças" -f finance_test.sql
fresh; run "portes e preço PVPR" -f ship_price_test.sql
fresh; run "recolhas e devoluções" -f returns_test.sql
fresh; run "operações do backoffice" -f admin_ops_test.sql
fresh; run "importação: ligar a produtos existentes" -f import_link_test.sql
fresh; run "área de cliente" -f customer_test.sql
fresh; run "várias transportadoras" -f shipping_options_test.sql
fresh; run "faturação InvoiceXpress" -f invoicing_test.sql
fresh; run "catálogo por modelos" -f models_test.sql
fresh; run "livre resolução" -f withdrawal_test.sql
fresh; run "avaliações e emails" -f reviews_test.sql
fresh; run "página inicial, conversas e manutenção" -f campaigns_test.sql
exit $fail
