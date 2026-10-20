-- =====================================================================
-- iNurse — redes sociais
--  · campanhas podem ser para TikTok e Pinterest, guardam a imagem do post e o resultado da publicação
--  · settings public.social: endereços dos perfis (aparecem no rodapé da loja)
-- =====================================================================
alter table campaigns drop constraint if exists campaigns_channel_check;
alter table campaigns add constraint campaigns_channel_check check (channel in ('email','instagram','facebook','tiktok','pinterest','google_ads','blog','sms'));
alter table campaigns add column if not exists published jsonb not null default '{}'::jsonb;  -- {instagram: {id, at}, facebook: {...}}

insert into settings (key, value) values ('public.social', '{"instagram":"","facebook":"","tiktok":"","pinterest":"","youtube":""}')
on conflict (key) do nothing;
