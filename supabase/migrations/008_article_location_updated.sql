-- ══════════════════════════════════════════════════════════════════
-- MIGRAÇÃO 008: Location e updated_at para artigos editoriais
-- ══════════════════════════════════════════════════════════════════

-- Local de onde o autor escreve (ex: "São Paulo, SP")
ALTER TABLE articles ADD COLUMN IF NOT EXISTS location TEXT;

-- Data da última edição
ALTER TABLE articles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;
