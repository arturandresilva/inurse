-- Página pública da encomenda: seguimento CTT e pedido de troca/devolução
create or replace function public.get_order_public(p_number int, p_token uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('number', o.number, 'status', o.status, 'payment_method', o.payment_method, 'total_cents', o.total_cents,
           'subtotal_cents', o.subtotal_cents, 'shipping_cents', o.shipping_cents, 'discount_cents', o.discount_cents,
           'created_at', o.created_at, 'shipping_address', o.shipping_address,
           'items', (select jsonb_agg(jsonb_build_object('id', i.id, 'title', i.title, 'option_value', i.option_value, 'quantity', i.quantity, 'unit_price_cents', i.unit_price_cents)) from order_items i where i.order_id = o.id),
           'iban', case when o.payment_method = 'transfer' then (select value->>'iban' from settings where key = 'public.payments') end,
           'payment', (select jsonb_build_object('reference', reference, 'status', status, 'raw', raw - 'secret') from payments where order_id = o.id order by created_at desc limit 1),
           'tracking', (select coalesce(jsonb_agg(jsonb_build_object('carrier', s.carrier, 'code', s.tracking_code, 'shipped_at', s.shipped_at)), '[]')
                          from shipments s where s.order_id = o.id and s.tracking_code is not null),
           'returns', (select coalesce(jsonb_agg(jsonb_build_object('number', r.number, 'status', r.status, 'kind', r.kind, 'tracking_code', r.tracking_code, 'label_url', r.label_url)), '[]')
                         from returns r where r.order_id = o.id),
           'return_until', (select (coalesce(max(s.shipped_at), o.created_at) + make_interval(days => coalesce((select (value->>'return_days')::int from settings where key = 'public.store'), 14) + 5))::date
                              from shipments s where s.order_id = o.id))
    from orders o where o.number = p_number and o.public_token = p_token;
$$;
