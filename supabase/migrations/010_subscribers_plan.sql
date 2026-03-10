-- ══════════════════════════════════════════════════════════════════
-- MIGRAÇÃO 010: Coluna plan na tabela subscribers
-- ══════════════════════════════════════════════════════════════════

ALTER TABLE subscribers
  ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'free'
  CHECK (plan IN ('free', 'premium'));
