-- ══════════════════════════════════════════════════════════════════
-- MIGRAÇÃO 004: CMS — Status de publicação + Row Level Security
-- ══════════════════════════════════════════════════════════════════

-- 1. Coluna status (draft/published)
ALTER TABLE articles
  ADD COLUMN status text NOT NULL DEFAULT 'published'
  CHECK (status IN ('draft', 'published'));

-- 2. Habilitar RLS na tabela articles
ALTER TABLE articles ENABLE ROW LEVEL SECURITY;

-- 3. Policies de leitura
CREATE POLICY "articles_public_read" ON articles
  FOR SELECT USING (status = 'published');

CREATE POLICY "articles_admin_read" ON articles
  FOR SELECT TO authenticated USING (true);

-- 4. Policies de escrita (apenas admin autenticado)
CREATE POLICY "articles_admin_insert" ON articles
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "articles_admin_update" ON articles
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "articles_admin_delete" ON articles
  FOR DELETE TO authenticated USING (true);

-- 5. Storage policies para o bucket article-images
CREATE POLICY "storage_admin_upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'article-images');

CREATE POLICY "storage_admin_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'article-images')
  WITH CHECK (bucket_id = 'article-images');

CREATE POLICY "storage_admin_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'article-images');

CREATE POLICY "storage_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'article-images');
