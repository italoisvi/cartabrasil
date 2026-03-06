-- =============================================
-- Carta Brasil — CRON para buscar RSS
-- =============================================
-- Requer a extensão pg_cron (já habilitada no Supabase)

-- Habilita pg_cron e pg_net (para chamadas HTTP)
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ── FETCH RSS: a cada 15 minutos busca notícias novas ──
select cron.schedule(
  'fetch-rss-every-15min',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://zlcntgizmaapqkteaxkd.supabase.co/functions/v1/fetch-rss',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpsY250Z2l6bWFhcHFrdGVheGtkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIzMDY3ODcsImV4cCI6MjA4Nzg4Mjc4N30.p-DHtTw-AeGYDswsBR73V8jQXlpW_g_6out1xtT6Cr4'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- ── SEND REALTIME: a cada 15 minutos envia alertas para assinantes "tempo real" ──
select cron.schedule(
  'send-realtime-every-15min',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://zlcntgizmaapqkteaxkd.supabase.co/functions/v1/send-newsletter?frequency=realtime',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpsY250Z2l6bWFhcHFrdGVheGtkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIzMDY3ODcsImV4cCI6MjA4Nzg4Mjc4N30.p-DHtTw-AeGYDswsBR73V8jQXlpW_g_6out1xtT6Cr4'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- ── SEND DAILY: todo dia às 07:00 (horário de Brasília = 10:00 UTC) ──
select cron.schedule(
  'send-daily-7am',
  '0 10 * * *',
  $$
  select net.http_post(
    url := 'https://zlcntgizmaapqkteaxkd.supabase.co/functions/v1/send-newsletter?frequency=daily',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpsY250Z2l6bWFhcHFrdGVheGtkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIzMDY3ODcsImV4cCI6MjA4Nzg4Mjc4N30.p-DHtTw-AeGYDswsBR73V8jQXlpW_g_6out1xtT6Cr4'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- ── SEND WEEKLY: toda segunda às 07:00 (horário de Brasília = 10:00 UTC) ──
select cron.schedule(
  'send-weekly-monday-7am',
  '0 10 * * 1',
  $$
  select net.http_post(
    url := 'https://zlcntgizmaapqkteaxkd.supabase.co/functions/v1/send-newsletter?frequency=weekly',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpsY250Z2l6bWFhcHFrdGVheGtkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIzMDY3ODcsImV4cCI6MjA4Nzg4Mjc4N30.p-DHtTw-AeGYDswsBR73V8jQXlpW_g_6out1xtT6Cr4'
    ),
    body := '{}'::jsonb
  );
  $$
);
