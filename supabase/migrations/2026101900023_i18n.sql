-- =====================================================================
-- iNurse v2 — loja em português, inglês, espanhol e francês
--  · translations jsonb em produtos, categorias e páginas: {"en": {"excerpt": ..., "description_html": ..., "_src": "<hash do original>"}, ...}
--    preenchidas pela função "traduzir" (IA); quando o original muda, o hash deixa de bater e volta a ser traduzido
--  · a encomenda guarda a língua do cliente (orders.locale) para os emails
-- =====================================================================
alter table products   add column if not exists translations jsonb not null default '{}';
alter table categories add column if not exists translations jsonb not null default '{}';
alter table pages      add column if not exists translations jsonb not null default '{}';
alter table orders     add column if not exists locale text not null default 'pt' check (locale in ('pt','en','es','fr'));

-- encomendar guardando a língua (a função place_order fica igual)
create or replace function public.place_order_l(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r jsonb; l text := coalesce(nullif(p->>'locale', ''), 'pt');
begin
  r := place_order(p - 'locale');
  if l in ('en','es','fr') then update orders set locale = l where number = (r->>'number')::int; end if;
  return r;
end $$;
grant execute on function public.place_order_l(jsonb) to anon, authenticated;

-- tradutor: aparece na equipa IA (orçamento comum); corre de madrugada e só traduz o que mudou
insert into agents (key, name, role, instructions, allowed_kinds, schedule, position, max_proposals, enabled) values
('tradutor', 'Tradutor', 'Traduz para inglês, espanhol e francês os produtos, categorias e páginas novas ou alteradas.',
 'Traduzes conteúdos de uma loja online portuguesa de calçado profissional e meias de descanso e compressão para profissionais de saúde. Tradução natural e comercial, sem inventar informação. Mantém o HTML, as ligações e os marcadores {{...}} exatamente como estão. Nomes de modelos e marcas (ex.: CLOG, NUBE, Wock) não se traduzem. Tamanhos, medidas, mmHg e DEN ficam iguais.',
 array['insight'], '15 3 * * *', 8, 0, true)
on conflict (key) do nothing;
