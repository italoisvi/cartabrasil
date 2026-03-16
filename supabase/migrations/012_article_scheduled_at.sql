-- Atualizar CHECK constraint do status para incluir 'scheduled'
ALTER TABLE articles DROP CONSTRAINT IF EXISTS articles_status_check;
ALTER TABLE articles ADD CONSTRAINT articles_status_check CHECK (status IN ('draft', 'published', 'scheduled'));

-- Adicionar coluna scheduled_at para agendamento de publicação
ALTER TABLE articles ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ;

-- Índice para buscar artigos agendados prontos para publicar
CREATE INDEX IF NOT EXISTS idx_articles_scheduled ON articles (scheduled_at) WHERE status = 'scheduled';

-- CRON: a cada minuto, publica artigos agendados cuja hora já passou
SELECT cron.schedule(
  'publish-scheduled-articles',
  '* * * * *',
  $$
  UPDATE articles
  SET status = 'published',
      published_at = NOW(),
      scheduled_at = NULL
  WHERE status = 'scheduled'
    AND scheduled_at <= NOW();
  $$
);
