-- =====================================================================
-- iNurse v2 — catálogo por modelos: cada cor continua a ser um produto (com os seus tamanhos, fotos e preço),
-- mas os produtos do mesmo modelo agrupam-se (products.model) e mostram-se como um só na loja, com a escolha da cor.
-- O modelo e a cor são deduzidos do nome ("CLOG 01 c/ Tira - LARANJA/BRANCAS" → "CLOG c/ Tira" + "Laranja/brancas")
-- e podem ser corrigidos na ficha do produto.
-- =====================================================================
alter table products add column if not exists model text;   -- nome do modelo (agrupa as cores); vazio = produto sozinho
alter table products add column if not exists color text;   -- nome da cor mostrado na escolha

create or replace function public.product_model_guess(p_title text, out model text, out color text)
language plpgsql immutable as $$
declare t text; parts text[]; base text; rest text; m text[];
  en jsonb := '{"black":"Preto","white":"Branco","green":"Verde","navyblue":"Azul marinho","lightblue":"Azul claro","fuchsia":"Fúcsia",
                "blue":"Azul","pink":"Rosa","grey":"Cinza","gray":"Cinza","red":"Vermelho","yellow":"Amarelo","orange":"Laranja"}';
begin
  -- tirar avisos de prazo ("- aprox. 15 dias úteis para entrega") que não fazem parte do nome
  t := trim(regexp_replace(coalesce(p_title, ''), '\s*-\s*aprox\.?\s.*$', '', 'i'));
  parts := regexp_split_to_array(t, '\s+-\s+');
  base := trim(parts[1]);
  rest := nullif(trim(array_to_string(parts[2:], ' – ')), '');
  if base ~ '\s\d{2}(\s|$)' then
    -- código de cor do fornecedor (01, 02…) no nome: o modelo é o nome sem o código
    model := trim(regexp_replace(regexp_replace(base, '\s+\d{2}(?=\s|$)', ''), '\mC/\s', 'c/ ', 'g'));
    color := rest;
    if color is null then color := (regexp_match(base, '\s(\d{2})(\s|$)'))[1]; end if;
  elsif rest is not null and regexp_replace(base, '\s(c/|com)\s.*$', '', 'i') = upper(regexp_replace(base, '\s(c/|com)\s.*$', '', 'i'))
        and base ~ '[A-Z]{3}' then
    -- nome do modelo em maiúsculas + " - COR" (ex.: "CHIROCLOGS CLASSIC - VERDE COM TIRA"); "com tira" passa para o modelo
    model := regexp_replace(base, '\mC/\s', 'c/ ', 'g');
    color := rest;
    if color ~* '\s+com\s+tira$' then
      color := regexp_replace(color, '\s+com\s+tira$', '', 'i');
      if model !~* 'tira' then model := model || ' c/ Tira'; end if;
    end if;
  else
    m := regexp_match(base, '^(.+?)\s+(\S+)$');
    if m is not null and en ? lower(m[2]) then
      model := m[1]; color := en->>lower(m[2]);
    end if;
  end if;
  if color is not null then color := upper(left(lower(color), 1)) || substr(lower(color), 2); end if;
  if model = '' then model := null; end if;
end $$;

-- produtos novos (importação, criação no backoffice): modelo e cor deduzidos se não vierem preenchidos
create or replace function public.products_model_default() returns trigger language plpgsql as $$
declare g record;
begin
  if new.model is null and new.color is null then
    g := product_model_guess(new.title);
    new.model := g.model; new.color := g.color;
  end if;
  return new;
end $$;
drop trigger if exists products_model_default on products;
create trigger products_model_default before insert on products for each row execute function products_model_default();

-- catálogo atual
update products p set model = g.model, color = g.color
  from (select id, (product_model_guess(title)).* from products) g
 where g.id = p.id and p.model is null and p.color is null;

create index if not exists products_model_idx on products (lower(model)) where model is not null;
