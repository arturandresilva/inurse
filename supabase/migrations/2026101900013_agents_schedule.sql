-- Agendador da equipa IA: de hora a hora chama a função "agentes" (mode=due), que corre os agentes cuja hora chegou.
-- O segredo fica só na base de dados (settings "cron", fora do alcance público).
insert into settings (key, value) values ('cron', jsonb_build_object('secret', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')))
on conflict (key) do nothing;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    execute 'create extension if not exists pg_cron';
    execute $q$select cron.schedule('agentes-de-hora-a-hora', '5 * * * *', $c$
      select net.http_post(
        url := 'https://ssmckeparvmrahsnoypt.supabase.co/functions/v1/agentes',
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', (select value->>'secret' from public.settings where key = 'cron')),
        body := '{"mode":"due"}'::jsonb,
        timeout_milliseconds := 150000)
    $c$)$q$;
  end if;
end $$;
