-- =====================================================================
-- iNurse v2 — modo de manutenção (backoffice → Configurações → Loja)
--  · settings 'public.maintenance' {enabled, message, until}: a loja mostra uma página de manutenção
--    (as páginas de encomenda, avaliação, livre resolução e as páginas legais continuam abertas)
--  · com a manutenção ligada não se aceitam encomendas novas, mesmo que alguém tenha a página do checkout aberta
-- =====================================================================
insert into settings (key, value) values ('public.maintenance', '{"enabled":false,"message":"","until":null}') on conflict (key) do nothing;

create or replace function public.place_order_l(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r jsonb; l text := coalesce(nullif(p->>'locale', ''), 'pt');
begin
  if coalesce((select (value->>'enabled')::boolean from settings where key = 'public.maintenance'), false) then
    raise exception 'A loja está em manutenção. Tente novamente dentro de pouco tempo.';
  end if;
  r := place_order(p - 'locale');
  if l in ('en','es','fr') then update orders set locale = l where number = (r->>'number')::int; end if;
  return r;
end $$;
grant execute on function public.place_order_l(jsonb) to anon, authenticated;
