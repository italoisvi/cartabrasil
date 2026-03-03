// ── ENTIDADE ARTIGO ─────────────────────────────────────────────
// Regras de negócio puras. Zero dependências externas.

import type { Category } from "./ports.ts";

/**
 * Decodifica HTML entities comuns do RSS.
 */
function decodeHtmlEntities(raw: string): string {
  return raw
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

/**
 * Normaliza o corpo HTML do RSS para texto limpo com <strong> preservados.
 * Pipeline: decode entities → preservar bold → strip HTML → restaurar bold.
 */
export function normalizeBody(rawHtml: string): string {
  const decoded = decodeHtmlEntities(rawHtml);

  return decoded
    .replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, "§BOLD§$1§/BOLD§")
    .replace(/<b[^>]*>([\s\S]*?)<\/b>/gi, "§BOLD§$1§/BOLD§")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/h[1-6]>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/[^\S\n]+/g, " ")
    .replace(/\n\s*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .replace(/§BOLD§([\s\S]*?)§\/BOLD§/g, "<strong>$1</strong>")
    .replace(/§\/?BOLD§/g, "");
}

/**
 * Extrai a descrição curta (lead) do conteúdo HTML original.
 * Prioriza o primeiro bloco <strong> como lead. Fallback: primeiros 200 chars do body.
 */
export function extractDescription(
  rawHtml: string,
  normalizedBody: string,
): string {
  const decoded = decodeHtmlEntities(rawHtml);
  const leadMatch = decoded.match(/<strong>([\s\S]*?)<\/strong>/i);

  if (leadMatch) {
    return leadMatch[1]
      .replace(/<[^>]*>/g, "")
      .replace(/\s{2,}/g, " ")
      .trim();
  }

  return (normalizedBody.slice(0, 200) + "…").replace(/<\/?strong>/g, "");
}

/**
 * Gera a legenda da imagem a partir do autor.
 */
export function buildImageCaption(creator: string): string | null {
  return creator ? `Foto: ${creator}` : null;
}

/**
 * Valida se a categoria é válida.
 */
export function isValidCategory(value: string): value is Category {
  return ["politica", "mercados", "internacional", "tecnologia", "geral"]
    .includes(value);
}
