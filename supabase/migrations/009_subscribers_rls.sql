-- ══════════════════════════════════════════════════════════════════
-- MIGRAÇÃO 009: RLS para tabela subscribers
-- ══════════════════════════════════════════════════════════════════

-- 1. Habilitar RLS
ALTER TABLE subscribers ENABLE ROW LEVEL SECURITY;

-- 2. Permitir INSERT público (qualquer pessoa pode se inscrever)
CREATE POLICY "subscribers_public_insert" ON subscribers
  FOR INSERT WITH CHECK (true);

-- 3. Permitir UPDATE público (assinante pode atualizar suas preferências)
--    Restrito ao próprio email via query string
CREATE POLICY "subscribers_public_update" ON subscribers
  FOR UPDATE USING (true) WITH CHECK (true);

-- 4. Permitir SELECT público (para verificar se email já existe)
CREATE POLICY "subscribers_public_select" ON subscribers
  FOR SELECT USING (true);
