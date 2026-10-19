-- Simula o mínimo do Supabase para testar as migrações num Postgres normal
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
end $$;
create schema if not exists auth;
create schema if not exists extensions;
create table auth.users (id uuid primary key default gen_random_uuid(), email text unique, encrypted_password text);
create function auth.uid() returns uuid language sql stable as $f$
  select nullif(coalesce(current_setting('request.jwt.claims', true)::jsonb->>'sub', current_setting('test.uid', true)), '')::uuid $f$;
create schema if not exists storage;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
alter table storage.objects enable row level security;
