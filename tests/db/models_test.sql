\set ON_ERROR_STOP 1
\pset pager off
-- catálogo por modelos: dedução de modelo e cor a partir dos nomes reais da loja
create temp table casos (titulo text, modelo text, cor text);
insert into casos values
 ('CLOG 01 c/ Tira - LARANJA/BRANCAS', 'CLOG c/ Tira', 'Laranja/brancas'),
 ('CLOG 03 - BRANCAS/AZUL MARINHO', 'CLOG', 'Brancas/azul marinho'),
 ('CLOG 01 com Palmilha Walksoft™ - LARANJA/BRANCAS', 'CLOG com Palmilha Walksoft™', 'Laranja/brancas'),
 ('BLOC OPEN 02 - AZUL MÉDIO', 'BLOC OPEN', 'Azul médio'),
 ('BREELITE 05 - CINZA ESCURO - EDIÇÃO LIMITADA', 'BREELITE', 'Cinza escuro – edição limitada'),
 ('EASYLITE NAVYBLUE', 'EASYLITE', 'Azul marinho'),
 ('EASYLITE BLACK', 'EASYLITE', 'Preto'),
 ('ASTROPRO 03', 'ASTROPRO', '03'),
 ('SECURLITE 01 C/ Palmilha', 'SECURLITE c/ Palmilha', '01'),
 ('NUBE 10 c/ Palmilha - CINZA', 'NUBE c/ Palmilha', 'Cinza'),
 ('EVERLITE CLOSED 02 - PRETO', 'EVERLITE CLOSED', 'Preto'),
 ('CHIROCLOGS PROFESSIONAL - AZUL - Aprox 15 dias úteis para entrega', 'CHIROCLOGS PROFESSIONAL', 'Azul'),
 ('CHIROCLOGS CLASSIC - VERDE COM TIRA', 'CHIROCLOGS CLASSIC c/ Tira', 'Verde'),
 ('CHIROCLOGS PROFESSIONAL c/ Tira - BRANCO', 'CHIROCLOGS PROFESSIONAL c/ Tira', 'Branco'),
 ('LENI', null, null),
 ('Meias Medicinais 140 DEN 18-21 mmHg', null, null),
 ('Meias medicinais de descanso 140 DEN 18-21 mmHg - Algodão', null, null),
 ('Collant Terapêutica Class II 340 DEN, 23-32 mmHg', null, null),
 ('Meias para Pé Diabético e artrítico', null, null);
select titulo, (product_model_guess(titulo)).* from casos;
do $$ declare r record; g record; begin
  for r in select * from casos loop
    g := product_model_guess(r.titulo);
    if g.model is distinct from r.modelo or g.color is distinct from r.cor then
      raise notice 'ERRO "%": deu % / %, esperava % / %', r.titulo, g.model, g.color, r.modelo, r.cor;
    end if;
  end loop;
end $$;
-- produto novo recebe modelo e cor; um com modelo dado à mão fica como está
insert into products (handle, title) values ('nube-07-lilas', 'NUBE 07 - LILÁS');
insert into products (handle, title, model, color) values ('x', 'NUBE 08 - AZUL', 'Outro', 'Azul');
do $$ begin
  if (select model || '|' || color from products where handle = 'nube-07-lilas') <> 'NUBE|Lilás' then raise notice 'ERRO trigger'; end if;
  if (select model from products where handle = 'x') <> 'Outro' then raise notice 'ERRO sobrepôs o modelo manual'; end if;
end $$;
