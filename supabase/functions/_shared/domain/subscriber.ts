// ── ENTIDADE ASSINANTE ──────────────────────────────────────────
// Regras de negócio puras. Zero dependências externas.

import type { ArticleRecord } from "./ports.ts";

/**
 * Filtra artigos pelas categorias preferidas do assinante.
 */
export function filterArticlesByPreferences(
  articles: ArticleRecord[],
  subscriberCategories: string[],
): ArticleRecord[] {
  return articles.filter((a) => subscriberCategories.includes(a.category));
}
