-- =====================================================================
-- iNurse — biblioteca de multimédia do backoffice
--  · o administrador pode listar os ficheiros dos baldes públicos (produtos e campanhas)
--  · media_list(balde, pesquisa, limite, início): ficheiros com tamanho, tipo, data, endereço e onde estão a ser usados
-- =====================================================================
create policy "admin lista imagens" on storage.objects for select to authenticated
  using (bucket_id in ('produtos', 'campanhas') and public.is_admin());

create or replace function public.media_list(p_bucket text, p_q text default null, p_limit int default 60, p_offset int default 0)
returns jsonb language plpgsql stable security definer set search_path = public, storage as $$
declare total int; items jsonb;
begin
  if not is_admin() then raise exception 'sem permissão'; end if;
  if p_bucket not in ('produtos', 'campanhas') then raise exception 'balde desconhecido'; end if;
  select count(*) into total from storage.objects o
   where o.bucket_id = p_bucket and o.name not like '%.emptyFolderPlaceholder'
     and (coalesce(p_q, '') = '' or o.name ilike '%' || p_q || '%');
  with f as (
    select o.name, o.created_at, o.updated_at, (o.metadata->>'size')::bigint as size, o.metadata->>'mimetype' as type,
           '/' || p_bucket || '/' || o.name as tail
      from storage.objects o
     where o.bucket_id = p_bucket and o.name not like '%.emptyFolderPlaceholder'
       and (coalesce(p_q, '') = '' or o.name ilike '%' || p_q || '%')
     order by o.created_at desc
     limit least(greatest(p_limit, 1), 200) offset greatest(p_offset, 0)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'name', f.name, 'size', f.size, 'type', f.type, 'created_at', f.created_at, 'updated_at', f.updated_at,
      'used', (
        select coalesce(jsonb_agg(u), '[]') from (
          select 'Produto: ' || p.title as u from product_images i join products p on p.id = i.product_id where i.url like '%' || f.tail
          union all
          select 'Campanha: ' || c.name from home_slides s join home_campaigns c on c.id = s.campaign_id
           where s.media_url like '%' || f.tail or s.mobile_url like '%' || f.tail or s.poster_url like '%' || f.tail
          union all
          select 'Página inicial' from settings where key = 'public.home' and value::text like '%' || f.tail || '%'
          union all
          select 'Página: ' || pg.title from pages pg where pg.body_html like '%' || f.tail || '%'
          union all
          select 'Descrição: ' || p.title from products p where p.description_html like '%' || f.tail || '%'
          limit 8) x)
    ) order by f.created_at desc), '[]') into items from f;
  return jsonb_build_object('total', total, 'items', items);
end $$;
revoke all on function public.media_list(text, text, int, int) from public;
grant execute on function public.media_list(text, text, int, int) to authenticated;
