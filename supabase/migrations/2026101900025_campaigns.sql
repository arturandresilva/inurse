-- =====================================================================
-- iNurse v2 — página inicial editável e campanhas (sliders de imagens e vídeos)
--  · home_campaigns: uma campanha tem um sítio na página inicial ("topo" = destaque grande no início, substitui o destaque normal;
--    "faixa" = banner a meio da página), datas de início/fim e estado (ativa/rascunho)
--  · home_slides: cada diapositivo é uma imagem ou um vídeo (com imagem para telemóvel opcional), textos e botão
--  · settings 'public.home': imagens do destaque normal e das categorias da página inicial
--  · bucket público "campanhas" (imagens até 50 MB, vídeos mp4/webm)
-- =====================================================================
create table if not exists home_campaigns (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  placement  text not null default 'topo' check (placement in ('topo', 'faixa')),
  status     text not null default 'draft' check (status in ('active', 'draft')),
  starts_at  timestamptz,
  ends_at    timestamptz,
  position   int not null default 0,
  interval_s int not null default 6 check (interval_s between 2 and 30),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists home_slides (
  id           uuid primary key default gen_random_uuid(),
  campaign_id  uuid not null references home_campaigns(id) on delete cascade,
  position     int not null default 0,
  kind         text not null default 'image' check (kind in ('image', 'video')),
  media_url    text not null,
  mobile_url   text,                      -- imagem própria para telemóvel (opcional)
  poster_url   text,                      -- imagem mostrada enquanto o vídeo carrega (opcional)
  eyebrow      text,
  title        text,
  body         text,
  cta_label    text,
  cta_url      text,
  theme        text not null default 'dark' check (theme in ('dark', 'light')),  -- dark = texto branco sobre a imagem
  align        text not null default 'left' check (align in ('left', 'center', 'right')),
  translations jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);
create index if not exists home_slides_campaign on home_slides(campaign_id, position);


alter table home_campaigns enable row level security;
alter table home_slides enable row level security;
-- a loja só vê campanhas ativas dentro das datas
create policy "campanhas visíveis" on home_campaigns for select
  using (status = 'active' and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now()));
create policy "diapositivos visíveis" on home_slides for select
  using (exists (select 1 from home_campaigns c where c.id = campaign_id));   -- a política de home_campaigns já filtra as visíveis
create policy "admin gere campanhas" on home_campaigns for all to authenticated using (is_admin()) with check (is_admin());
create policy "admin gere diapositivos" on home_slides for all to authenticated using (is_admin()) with check (is_admin());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('campanhas', 'campanhas', true, 52428800, array['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm'])
on conflict (id) do nothing;
create policy "admin envia campanhas" on storage.objects for insert to authenticated with check (bucket_id = 'campanhas' and public.is_admin());
create policy "admin altera campanhas" on storage.objects for update to authenticated using (bucket_id = 'campanhas' and public.is_admin());
create policy "admin remove campanhas" on storage.objects for delete to authenticated using (bucket_id = 'campanhas' and public.is_admin());

insert into settings (key, value) values ('public.home', '{"hero_images":[],"tiles":{}}') on conflict (key) do nothing;
