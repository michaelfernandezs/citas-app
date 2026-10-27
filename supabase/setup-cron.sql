-- Ejecutar una vez en SQL Editor, DESPUÉS de configurar Vault y desplegar el worker.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
-- Ofertas: no depende de clientes conectados.
select cron.schedule('citas-expire-offers','* * * * *', $$select citas.expire_offers();$$);
-- Crear en Vault (Dashboard) los secretos citas_project_url y citas_worker_secret.
-- citas_project_url = https://TU-PROYECTO.supabase.co
-- citas_worker_secret debe coincidir con OFFER_WORKER_SECRET de la Edge Function.
select cron.schedule('citas-send-offer-emails','* * * * *', $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name='citas_project_url') || '/functions/v1/send-offer-emails',
    headers := jsonb_build_object('Content-Type','application/json','x-worker-secret',
      (select decrypted_secret from vault.decrypted_secrets where name='citas_worker_secret')),
    body := '{}'::jsonb, timeout_milliseconds := 60000
  );
$$);
