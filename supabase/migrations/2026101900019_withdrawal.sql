-- =====================================================================
-- iNurse v2 — direito de livre resolução (DL 24/2014): formulário no site
--  · o cliente identifica a encomenda com o número e o email (não precisa do link nem de conta)
--  · a declaração fica guardada (nome, morada, datas, artigos, data/hora da declaração) num pedido de devolução
--  · o backoffice vê-o em Devoluções com o motivo "Livre resolução"
-- =====================================================================
alter table returns drop constraint if exists returns_reason_check;
alter table returns add constraint returns_reason_check check (reason in ('tamanho','defeito','engano_envio','nao_gostou','outro','livre_resolucao'));
alter table returns add column if not exists withdrawal jsonb;   -- declaração de livre resolução, tal como foi submetida

create or replace function public.withdrawal_order(p_number int, p_email text) returns orders
language sql stable security definer set search_path = public as $$
  select * from orders where number = p_number and lower(trim(email)) = lower(trim(p_email));
$$;
revoke all on function public.withdrawal_order(int, text) from public, anon, authenticated;

-- Encontrar a encomenda e os artigos (para o cliente escolher o que devolve)
create or replace function public.withdrawal_lookup(p_number int, p_email text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare o orders; lim int; ship timestamptz;
begin
  o := withdrawal_order(p_number, p_email);
  if o.id is null then raise exception 'não encontrámos uma encomenda com esse número e email'; end if;
  if o.status in ('cancelled', 'refunded') then raise exception 'esta encomenda já está %', order_status_label(o.status); end if;
  if exists (select 1 from returns where order_id = o.id and status not in ('rejected','cancelled')) then
    raise exception 'já existe um pedido de devolução para esta encomenda; responderemos por email';
  end if;
  select coalesce((value->>'return_days')::int, 14) into lim from settings where key = 'public.store';
  select max(shipped_at) into ship from shipments where order_id = o.id;
  if ship is not null and ship < now() - make_interval(days => lim + 5) then
    raise exception 'o prazo de % dias para a livre resolução terminou', lim;
  end if;
  return jsonb_build_object('number', o.number, 'created_at', o.created_at, 'shipped_at', ship, 'days', lim,
    'name', o.shipping_address->>'name',
    'address', concat_ws(', ', o.shipping_address->>'line1', nullif(o.shipping_address->>'line2', ''), concat_ws(' ', o.shipping_address->>'zip', o.shipping_address->>'city')),
    'items', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'title', title, 'option_value', option_value, 'quantity', quantity) order by title), '[]')
                from order_items where order_id = o.id));
end $$;
grant execute on function public.withdrawal_lookup(int, text) to anon, authenticated;

-- Submeter a declaração
create or replace function public.withdrawal_submit(p_number int, p_email text, p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare o orders; info jsonb; items jsonb; it jsonb; rid uuid; rnum int; ra uuid; decl jsonb; at timestamptz := now();
begin
  info := withdrawal_lookup(p_number, p_email);            -- valida encomenda, prazo e pedidos repetidos
  o := withdrawal_order(p_number, p_email);
  if coalesce(trim(p->>'name'), '') = '' then raise exception 'indique o seu nome'; end if;
  items := coalesce(p->'items', '[]');
  if jsonb_array_length(items) = 0 then                      -- sem escolha: a encomenda toda
    select jsonb_agg(jsonb_build_object('order_item_id', id, 'quantity', quantity)) into items from order_items where order_id = o.id;
  end if;
  for it in select * from jsonb_array_elements(items) loop
    if not exists (select 1 from order_items where id = (it->>'order_item_id')::uuid and order_id = o.id
                     and quantity >= greatest(1, coalesce((it->>'quantity')::int, 1))) then
      raise exception 'artigo inválido';
    end if;
  end loop;
  decl := jsonb_build_object(
    'texto', 'Pela presente comunico que resolvo o meu contrato de compra e venda relativo aos bens indicados.',
    'nome', left(trim(p->>'name'), 120), 'morada', left(coalesce(nullif(trim(p->>'address'), ''), info->>'address'), 300),
    'email', lower(trim(p_email)), 'encomenda', o.number, 'encomendado_em', to_char(o.created_at at time zone 'Europe/Lisbon', 'YYYY-MM-DD'),
    'recebido_em', nullif(p->>'received_on', ''), 'declarado_em', to_char(at at time zone 'Europe/Lisbon', 'YYYY-MM-DD HH24:MI'),
    'iban', nullif(regexp_replace(upper(coalesce(p->>'iban', '')), '\s', '', 'g'), ''));
  select id into ra from pickup_addresses where is_return_address and active;
  insert into returns (order_id, reason, kind, items, customer_notes, return_address_id, withdrawal)
  values (o.id, 'livre_resolucao', 'reembolso', items, left(p->>'notes', 1000), ra, decl)
  returning id, number into rid, rnum;
  insert into order_events (order_id, kind, message)
  values (o.id, 'devolucao', 'Livre resolução declarada pelo cliente no site (pedido n.º ' || rnum || ')');
  return jsonb_build_object('return_number', rnum, 'declaration', decl);
end $$;
grant execute on function public.withdrawal_submit(int, text, jsonb) to anon, authenticated;
