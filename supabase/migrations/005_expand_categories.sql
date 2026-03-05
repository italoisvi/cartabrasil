-- Expande o CHECK constraint de category para incluir novas editorias da Agência Brasil
ALTER TABLE articles
  DROP CONSTRAINT IF EXISTS articles_category_check;

ALTER TABLE articles
  ADD CONSTRAINT articles_category_check
  CHECK (category IN (
    'politica', 'mercados', 'internacional', 'tecnologia', 'geral',
    'direitos-humanos', 'educacao', 'esportes', 'justica', 'saude',
    'economia', 'analise'
  ));
