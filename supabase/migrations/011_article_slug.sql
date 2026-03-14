-- ══════════════════════════════════════════════════════════════════
-- MIGRAÇÃO 011: Slug para URLs amigáveis de compartilhamento
-- ══════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS unaccent;

-- Coluna slug
ALTER TABLE articles ADD COLUMN slug TEXT;

-- Gerar slugs para artigos existentes
UPDATE articles SET slug = substring(
  regexp_replace(
    regexp_replace(
      regexp_replace(
        lower(unaccent(coalesce(title, ''))),
        '[^a-z0-9]+', '-', 'g'
      ),
      '^-+|-+$', '', 'g'
    ),
    '-{2,}', '-', 'g'
  )
  FROM 1 FOR 80
);

-- Resolver duplicatas: anexar prefixo do UUID
WITH dupes AS (
  SELECT id, slug,
    ROW_NUMBER() OVER (PARTITION BY slug ORDER BY published_at) AS rn
  FROM articles
  WHERE slug IS NOT NULL
)
UPDATE articles a
SET slug = a.slug || '-' || substring(a.id::text, 1, 8)
FROM dupes d
WHERE a.id = d.id AND d.rn > 1;

-- Índice único
CREATE UNIQUE INDEX idx_articles_slug ON articles(slug);
