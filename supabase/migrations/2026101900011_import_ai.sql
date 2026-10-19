-- =====================================================================
-- iNurse v2 — importação inteligente de folhas de fornecedor
--  · ficheiros guardados num espaço privado (bucket "importacoes")
--  · liga linhas da folha a produtos que já existem na loja (vindos da loja CTT)
--  · ao aplicar, os produtos ligados ficam associados ao fornecedor e à referência dele
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('importacoes', 'importacoes', false, 20971520,
        array['application/pdf','text/csv','text/plain','application/vnd.ms-excel',
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/octet-stream'])
on conflict (id) do nothing;
create policy "admin envia folhas" on storage.objects for insert to authenticated
  with check (bucket_id = 'importacoes' and public.is_admin());
create policy "admin lê folhas" on storage.objects for select to authenticated
  using (bucket_id = 'importacoes' and public.is_admin());
create policy "admin remove folhas" on storage.objects for delete to authenticated
  using (bucket_id = 'importacoes' and public.is_admin());

-- texto normalizado para comparar nomes/referências ("BREELITE 01 - Azul" -> "BREELITE01AZUL")
create or replace function public.norm_key(t text) returns text language sql immutable as $$
  select upper(regexp_replace(public.immutable_unaccent(coalesce(t, '')), '[^A-Za-z0-9]+', '', 'g'))
$$;

-- tamanho comparável: "II" = "2", " 38 " = "38", "35/6" = "35/36"
create or replace function public.size_key(t text) returns text language sql immutable as $$
  select case upper(trim(coalesce(t, '')))
    when 'I' then '1' when 'II' then '2' when 'III' then '3' when 'IV' then '4' when 'V' then '5'
    when 'VI' then '6' when 'VII' then '7' when 'UNICO' then 'ÚNICO' when 'U' then 'ÚNICO'
    else regexp_replace(upper(trim(coalesce(t, ''))), '^(\d)(\d)/(\d)$', '\1\2/\1\3') end
$$;

-- tamanhos que só diferem na escrita (I/1): a linha passa a usar o nome do tamanho da loja
create or replace function public.align_import_sizes(p_job uuid) returns int
language plpgsql security invoker set search_path = public as $$
declare n int;
begin
  update import_rows ir set match_variant_id = v.id, size = v.option_value,
         action = case when ir.action = 'skip' then 'skip' else 'update' end
    from variants v
   where ir.job_id = p_job and ir.match_product_id is not null and ir.match_variant_id is null
     and v.product_id = ir.match_product_id and size_key(v.option_value) = size_key(ir.size);
  get diagnostics n = row_count;
  return n;
end $$;

-- Liga linhas sem correspondência a produtos já existentes, pela referência do modelo
-- (no SKU ou no nome do produto) e, se preciso, pelo nome + cor. Só liga quando há um único candidato.
create or replace function public.link_import_candidates(p_job uuid) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare r record; cand uuid[]; n_linked int := 0; n_amb int := 0;
begin
  if not is_admin() then raise exception 'sem permissão'; end if;
  for r in select distinct on (model_ref) model_ref, title, color
             from import_rows where job_id = p_job and match_product_id is null and model_ref is not null and action <> 'skip'
             order by model_ref, row_index loop
    -- 1) nome do produto começa pela referência do modelo
    select array_agg(distinct p.id) into cand from products p
     where p.supplier_ref is null and p.status <> 'archived' and length(norm_key(r.model_ref)) >= 4
       and norm_key(p.title) like norm_key(r.model_ref) || '%';
    -- 2) SKU começa pela referência
    if coalesce(array_length(cand, 1), 0) <> 1 then
      select array_agg(distinct p.id) into cand from products p
       where p.supplier_ref is null and p.status <> 'archived' and length(norm_key(r.model_ref)) >= 4
         and exists (select 1 from variants v where v.product_id = p.id and norm_key(v.sku) like norm_key(r.model_ref) || '%');
    end if;
    -- 3) nome + cor
    if coalesce(array_length(cand, 1), 0) <> 1 and r.title is not null and r.color is not null then
      select array_agg(distinct p.id) into cand from products p
       where p.supplier_ref is null and p.status <> 'archived'
         and norm_key(p.title) like '%' || norm_key(r.title) || '%'
         and norm_key(p.title) like '%' || norm_key(r.color) || '%';
    end if;
    if coalesce(array_length(cand, 1), 0) = 1 then
      update import_rows ir set match_product_id = cand[1],
             match_variant_id = (select v.id from variants v where v.product_id = cand[1] and lower(v.option_value) = lower(coalesce(ir.size, '')) limit 1),
             issues = array_append(array_remove(ir.issues, 'ligado pelo nome'), 'ligado pelo nome')
       where ir.job_id = p_job and ir.model_ref = r.model_ref and ir.match_product_id is null;
      n_linked := n_linked + 1;
    elsif coalesce(array_length(cand, 1), 0) > 1 then
      -- não cria um duplicado sem decisão: fica "ignorar" até escolheres o produto (ou "criar")
      update import_rows ir set action = 'skip', issues = array_append(array_remove(ir.issues, 'vários produtos parecidos'), 'vários produtos parecidos')
       where ir.job_id = p_job and ir.model_ref = r.model_ref and ir.match_product_id is null;
      n_amb := n_amb + 1;
    end if;
  end loop;
  -- ação de acordo com a nova ligação
  update import_rows set action = case when match_variant_id is not null then 'update' else 'create' end
   where job_id = p_job and match_product_id is not null and action <> 'skip';
  perform align_import_sizes(p_job);
  update import_jobs j set stats = j.stats || jsonb_build_object(
           'criar', (select count(*) from import_rows where job_id = p_job and action = 'create'),
           'atualizar', (select count(*) from import_rows where job_id = p_job and action = 'update'),
           'ignorar', (select count(*) from import_rows where job_id = p_job and action = 'skip'),
           'ligados_pelo_nome', n_linked, 'ambiguos', n_amb)
   where id = p_job;
  return jsonb_build_object('ligados', n_linked, 'ambiguos', n_amb);
end $$;
grant execute on function public.link_import_candidates(uuid) to authenticated;

-- Escolha manual: ligar todas as linhas de um modelo a um produto (ou desligar com null)
create or replace function public.set_import_product(p_job uuid, p_model_ref text, p_product uuid) returns void
language plpgsql security invoker set search_path = public as $$
begin
  if not is_admin() then raise exception 'sem permissão'; end if;
  update import_rows ir set match_product_id = p_product,
         match_variant_id = case when p_product is null then null else
           (select v.id from variants v where v.product_id = p_product and lower(v.option_value) = lower(coalesce(ir.size, '')) limit 1) end,
         issues = array_remove(array_remove(ir.issues, 'vários produtos parecidos'), 'ligado pelo nome'),
         action = case when p_product is not null and exists (select 1 from variants v where v.product_id = p_product and lower(v.option_value) = lower(coalesce(ir.size, ''))) then 'update'
                       else 'create' end
   where ir.job_id = p_job and ir.model_ref = p_model_ref;
  perform align_import_sizes(p_job);
end $$;
grant execute on function public.set_import_product(uuid, text, uuid) to authenticated;

-- Ao aplicar: os produtos existentes ligados passam a pertencer ao fornecedor e guardam a referência dele
create or replace function public.import_link_products() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'applied' and old.status is distinct from 'applied' then
    update products p set supplier_id = coalesce(new.supplier_id, p.supplier_id),
                          supplier_ref = coalesce(p.supplier_ref, x.model_ref), updated_at = now()
      from (select distinct on (match_product_id) match_product_id, model_ref from import_rows
             where job_id = new.id and match_product_id is not null and action in ('create','update') and model_ref is not null
             order by match_product_id, row_index) x
     where p.id = x.match_product_id;
  end if;
  return new;
end $$;
create trigger trg_import_link after update of status on import_jobs for each row execute function import_link_products();

-- Registo do custo da IA usada a ler folhas (aparece no Contabilista como custo de IA); não corre sozinho.
insert into agents (key, name, role, instructions, allowed_kinds, schedule, enabled, position)
values ('importador', 'Leitor de folhas', 'Lê tabelas de preços de fornecedores (PDF) quando importas uma folha.', '-', '{}', 'manual', false, 99)
on conflict (key) do nothing;
