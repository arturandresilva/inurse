\set ON_ERROR_STOP 1
\pset pager off
-- importação: ligar linhas a produtos existentes (nome/SKU), tamanhos I=1, e associar ao fornecedor ao aplicar
insert into auth.users(id,email) values ('00000000-0000-0000-0000-000000000001','artur.impact@gmail.com');
set test.uid = '00000000-0000-0000-0000-000000000001';
insert into suppliers (id, name) values ('30000000-0000-0000-0000-000000000001','Nursing Care');
insert into products (id, handle, title, status) values
 ('40000000-0000-0000-0000-000000000001','b1','BREELITE 01 - AZUL MARINHO','active'),
 ('40000000-0000-0000-0000-000000000002','b2','BREELITE 02 - PRETAS','active'),
 ('40000000-0000-0000-0000-000000000003','m','Meias Medicinais 140 DEN','active'),
 ('40000000-0000-0000-0000-000000000004','c1','CLOG 01 - LARANJA','active'),
 ('40000000-0000-0000-0000-000000000005','c2','CLOG 01 com Palmilha - LARANJA','active');
insert into variants (product_id, option_value, sku, price_cents) values
 ('40000000-0000-0000-0000-000000000001','36','BREELITE 01 - AZUL MARINHO',7490), ('40000000-0000-0000-0000-000000000001','37','BREELITE 01 - AZUL MARINHO',7490),
 ('40000000-0000-0000-0000-000000000002','36','BREELITE 01 - AZUL MARINHO',7490),   -- SKU errado vindo da loja antiga
 ('40000000-0000-0000-0000-000000000003','I','MN21',990), ('40000000-0000-0000-0000-000000000003','II','MN21',990),
 ('40000000-0000-0000-0000-000000000004','38','CLOG01',5000), ('40000000-0000-0000-0000-000000000005','38','CLOG01P',5000);
insert into import_jobs (id, supplier_id, file_name, status) values ('60000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','t.csv','mapping');
insert into import_rows (job_id, row_index, raw, model_ref, title, color, size, supplier_sku, cost_cents, rrp_cents, vat_rate) values
 ('60000000-0000-0000-0000-000000000001',1,'{}','BREELITE 01','Breelite','Azul Marinho','36','BREELITE 01-36',3798,7490,23),
 ('60000000-0000-0000-0000-000000000001',2,'{}','BREELITE 01','Breelite','Azul Marinho','38','BREELITE 01-38',3798,7490,23),
 ('60000000-0000-0000-0000-000000000001',3,'{}','BREELITE 02','Breelite','Preto','36','BREELITE 02-36',3798,7490,23),
 ('60000000-0000-0000-0000-000000000001',4,'{}','MN21','Meia Descanso','Bege','1','MN21-1',745,990,6),
 ('60000000-0000-0000-0000-000000000001',5,'{}','MN21','Meia Descanso','Bege','2','MN21-2',745,990,6),
 ('60000000-0000-0000-0000-000000000001',6,'{}','CLOG 01','Clog','Laranja','38','CLOG 01-38',2500,5000,23),
 ('60000000-0000-0000-0000-000000000001',7,'{}','NOVO 1','Novo','Azul','40','NOVO 1-40',2000,4990,23);
select match_import_job('60000000-0000-0000-0000-000000000001');
select link_import_candidates('60000000-0000-0000-0000-000000000001') as ligacao;
select row_index, model_ref, size, action, p.title as produto, match_variant_id is not null as tamanho_existe, issues
  from import_rows r left join products p on p.id = r.match_product_id order by row_index;
do $$ declare x record; begin
  for x in select r.row_index, r.action, p.handle, r.size from import_rows r left join products p on p.id = r.match_product_id loop
    if (x.row_index = 1 and (x.handle <> 'b1' or x.action <> 'update'))
    or (x.row_index = 2 and (x.handle <> 'b1' or x.action <> 'create'))
    or (x.row_index = 3 and x.handle <> 'b2')
    or (x.row_index in (4,5) and (x.handle <> 'm' or x.action <> 'update' or x.size not in ('I','II')))
    or (x.row_index = 6 and (x.handle is not null or x.action <> 'skip'))
    or (x.row_index = 7 and (x.handle is not null or x.action <> 'create')) then
      raise notice 'ERRO linha %: % % %', x.row_index, x.handle, x.action, x.size;
    end if;
  end loop;
  if not exists (select 1 from import_rows where row_index = 6 and 'vários produtos parecidos' = any(issues)) then raise notice 'ERRO CLOG 01 devia ser ambíguo'; end if;
end $$;
\echo '-- escolha manual para o CLOG 01:'
select set_import_product('60000000-0000-0000-0000-000000000001', 'CLOG 01', '40000000-0000-0000-0000-000000000004');
select action, issues from import_rows where row_index = 6;
do $$ begin if (select action from import_rows where row_index = 6) <> 'update' then raise notice 'ERRO escolha manual devia atualizar'; end if; end $$;
select apply_import_job('60000000-0000-0000-0000-000000000001');
select title, supplier_ref, supplier_id is not null as do_fornecedor, status from products order by title;
select p.title, v.option_value, v.cost_cents, v.rrp_cents from variants v join products p on p.id = v.product_id where p.handle in ('b1','m') order by 1, v.position;
do $$ begin
  if (select supplier_ref from products where handle = 'b1') <> 'BREELITE 01' then raise notice 'ERRO produto não ficou com a referência do fornecedor'; end if;
  if (select count(*) from variants v join products p on p.id=v.product_id where p.handle='m') <> 2 then raise notice 'ERRO tamanhos 1/2 duplicaram I/II'; end if;
  if (select cost_cents from variants v join products p on p.id=v.product_id where p.handle='m' and option_value='II') <> 745 then raise notice 'ERRO custo não atualizado'; end if;
  if (select status from products where title = 'Novo') <> 'draft' then raise notice 'ERRO produto novo devia ficar em rascunho'; end if;
end $$;
