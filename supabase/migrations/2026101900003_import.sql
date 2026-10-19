-- Importação (repetível) das exportações da Loja Online CTT.
-- O browser converte os CSV em JSON e chama estas funções em blocos.
-- Regras: nunca mexe no stock; não substitui imagens já existentes; atualiza textos e preços.

alter table products add constraint products_legacy_handle_key unique (legacy_handle);

create or replace function public.import_catalog(items jsonb)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  it jsonb; v jsonb; cpath text; parts text[]; i int; ppath text;
  pid uuid; bid uuid; cid uuid; parent uuid; is_new boolean; hnd text; n int;
  created int := 0; updated int := 0; nvar int := 0; nimg int := 0;
begin
  if not is_admin() then raise exception 'sem permissão'; end if;
  for it in select * from jsonb_array_elements(items) loop
    -- marca
    bid := null;
    if coalesce(it->>'b','') <> '' then
      insert into brands (name, slug) values (it->>'b', lower(regexp_replace(it->>'b','[^A-Za-z0-9]+','-','g')))
        on conflict (name) do update set name = excluded.name returning id into bid;
    end if;

    select id into pid from products where legacy_handle = it->>'lh';
    is_new := pid is null;
    if is_new then
      hnd := it->>'h'; n := 2;
      while exists (select 1 from products where handle = hnd) loop hnd := (it->>'h') || '-' || n; n := n + 1; end loop;
      insert into products (handle, legacy_handle, title, excerpt, description_html, brand, brand_id, tags, status, vat_rate,
                            weight_g, featured, seo_title, seo_description, position)
      values (hnd, it->>'lh', it->>'t', nullif(it->>'ex',''), it->>'d', nullif(it->>'b',''), bid,
              array(select jsonb_array_elements_text(coalesce(it->'tg','[]'))), coalesce(it->>'st','active'),
              (it->>'vat')::numeric, nullif(it->>'w','')::int, coalesce((it->>'f')::boolean,false),
              nullif(it->>'st_t',''), nullif(it->>'st_d',''), coalesce((it->>'p')::int,0))
      returning id into pid;
      created := created + 1;
    else
      update products set title = it->>'t', excerpt = nullif(it->>'ex',''), description_html = it->>'d',
             brand = nullif(it->>'b',''), brand_id = bid, tags = array(select jsonb_array_elements_text(coalesce(it->'tg','[]'))),
             vat_rate = (it->>'vat')::numeric, weight_g = nullif(it->>'w','')::int,
             seo_title = nullif(it->>'st_t',''), seo_description = nullif(it->>'st_d',''), updated_at = now()
       where id = pid;
      updated := updated + 1;
    end if;

    -- categorias (cria a árvore se faltar)
    for cpath in select jsonb_array_elements_text(coalesce(it->'c','[]')) loop
      parts := string_to_array(cpath, '>'); parent := null;
      for i in 1..array_length(parts,1) loop
        ppath := array_to_string(parts[1:i], '>');
        select id into cid from categories where path = ppath;
        if cid is null then
          insert into categories (parent_id, name, slug, path, position)
          values (parent, parts[i], lower(regexp_replace(parts[i],'[^A-Za-z0-9]+','-','g')), ppath,
                  (select count(*) from categories))
          returning id into cid;
        end if;
        parent := cid;
      end loop;
      insert into product_categories values (pid, cid) on conflict do nothing;
    end loop;

    -- tamanhos: atualiza SKU e preço, nunca o stock
    i := 0;
    for v in select * from jsonb_array_elements(coalesce(it->'v','[]')) loop
      insert into variants (product_id, option_value, sku, price_cents, position)
      values (pid, v->>0, nullif(v->>1,''), (v->>2)::int, i)
      on conflict (product_id, option_value) do update set sku = excluded.sku, price_cents = excluded.price_cents;
      i := i + 1; nvar := nvar + 1;
    end loop;

    -- estado: só usa o dos CTT enquanto o stock ainda não foi contado
    if not exists (select 1 from variants where product_id = pid and stock is not null) then
      update products set status = coalesce(it->>'st','active') where id = pid and status in ('active','out_of_stock');
    end if;

    -- imagens: só se o produto ainda não tiver
    if not exists (select 1 from product_images where product_id = pid) then
      insert into product_images (product_id, url, position)
      select pid, u, ord - 1 from jsonb_array_elements_text(coalesce(it->'i','[]')) with ordinality as x(u, ord);
      get diagnostics n = row_count; nimg := nimg + n;
    end if;
  end loop;
  return jsonb_build_object('criados', created, 'atualizados', updated, 'tamanhos', nvar, 'imagens', nimg);
end $$;

create or replace function public.import_customers(items jsonb)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare it jsonb; a jsonb; cid uuid; created int := 0; updated int := 0; dl jsonb;
begin
  if not is_admin() then raise exception 'sem permissão'; end if;
  for it in select * from jsonb_array_elements(items) loop
    select id into cid from customers where email = it->>0;
    if cid is null then
      insert into customers (email, name, company, nif, phone, newsletter, legacy_total_spent_cents, legacy_total_orders, created_at)
      values (it->>0, nullif(it->>1,''), nullif(it->>2,''), nullif(it->>3,''), nullif(it->>4,''), (it->>5)::boolean,
              (it->>6)::int, (it->>7)::int, coalesce(nullif(it->>8,'')::timestamptz, now()))
      returning id into cid;
      created := created + 1;
    else
      update customers set name = coalesce(nullif(it->>1,''), name), company = coalesce(nullif(it->>2,''), company),
             nif = coalesce(nullif(it->>3,''), nif), phone = coalesce(nullif(it->>4,''), phone),
             newsletter = newsletter or (it->>5)::boolean,
             legacy_total_spent_cents = (it->>6)::int, legacy_total_orders = (it->>7)::int
       where id = cid;
      updated := updated + 1;
    end if;
    if not exists (select 1 from addresses where customer_id = cid) then
      dl := null;
      for a in select * from jsonb_array_elements(coalesce(it->9,'[]')) loop
        if a->>0 = 'billing=' then a := jsonb_set(dl, '{0}', '"billing"'); end if;
        if a->>0 = 'delivery' then dl := a; end if;
        insert into addresses (customer_id, kind, name, phone, line1, line2, zip, city, region, country_code)
        values (cid, a->>0, nullif(a->>1,''), nullif(a->>2,''), nullif(a->>3,''), nullif(a->>4,''),
                nullif(a->>5,''), nullif(a->>6,''), nullif(a->>7,''), 'PT');
      end loop;
    end if;
  end loop;
  return jsonb_build_object('criados', created, 'atualizados', updated);
end $$;

grant execute on function public.import_catalog(jsonb), public.import_customers(jsonb), public.set_stock(uuid,int,text) to authenticated;

-- Administradores: o email autorizado passa a admin ao criar conta
create table admin_invites (email text primary key);
alter table admin_invites enable row level security;
create policy "admin gere convites" on admin_invites for all to authenticated using (is_admin()) with check (is_admin());
insert into admin_invites values ('artur.impact@gmail.com');

create or replace function public.grant_admin_on_signup() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from admin_invites where lower(email) = lower(new.email)) then
    insert into admins (user_id, email) values (new.id, new.email) on conflict do nothing;
  end if;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.grant_admin_on_signup();
