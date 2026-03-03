-- ══════════════════════════════════════════════════════════════════
-- MIGRAÇÃO 003: Reprocessar artigos com HTML rico
-- ══════════════════════════════════════════════════════════════════
-- O normalizeBody antigo salvava texto plano (strip all HTML).
-- O novo normalizeBody preserva HTML semântico (p, blockquote, h2, figure).
--
-- Estratégia: deletar artigos existentes para que o fetch-rss
-- re-colete os que ainda estão no feed RSS com o novo formato.
--
-- IMPORTANTE: Executar fetch-rss logo após esta migração!
-- ══════════════════════════════════════════════════════════════════

DELETE FROM articles;
