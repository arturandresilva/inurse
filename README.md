# iNurse

Loja online e backoffice da iNurse (calçado profissional, socas hospitalares, meias de descanso e compressão).

## Estrutura
- `supabase/migrations/` — esquema da base de dados (Supabase/Postgres), aplicado por ordem.
- `supabase/functions/` — funções do servidor (Edge Functions).
- `tools/import/` — importação: exportações da Loja Online CTT e tabelas de preços de fornecedores em PDF.
- `tests/db/` — testes da base de dados (preços, checkout, agentes, finanças, portes, devoluções).
- `legacy/backoffice-v1/` — backoffice provisório (substituído pela app Next.js).

## Princípios
- Preços guardados em cêntimos, com IVA; custos e resultados sem IVA.
- Toda a lógica crítica (checkout, preços, stock, propostas dos agentes) vive na base de dados, com segurança por linha (RLS).
- Os agentes de IA só propõem; nada muda sem aprovação no backoffice.
