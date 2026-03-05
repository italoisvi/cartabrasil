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
 * Transforma blocos de imagem inline da EBC (div.dnd-widget-wrapper)
 * em <figure><img><figcaption> semânticos.
 *
 * Estrutura real da EBC (após decodeHtmlEntities):
 *   <div class="dnd-widget-wrapper ...">
 *     <div class="dnd-atom-rendered">
 *       <img src=".../loading_v2.gif" data-echo="REAL_URL" alt="..." title="...">
 *       <noscript><img src="REAL_URL" ...></noscript>
 *     </div>
 *     <div class="dnd-caption-wrapper">
 *       <h6 class="meta">CAPTION - <strong>CREDIT</strong></h6>
 *     </div>
 *   </div>
 *
 * O bloco termina com </div></div> (caption-wrapper + widget-wrapper).
 * O regex anterior esperava 3 </div> consecutivos, por isso nunca batia.
 */
function transformInlineImages(html: string): string {
  // Matches opening dnd-widget-wrapper até o fechamento duplo </div></div>
  // que corresponde a caption-wrapper + widget-wrapper.
  const widgetRegex =
    /<div[^>]*class="[^"]*dnd-widget-wrapper[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/gi;

  return html.replace(widgetRegex, (_match, inner: string) => {
    // Extrair URL real: data-echo tem prioridade, senão pega do <noscript><img src>
    const dataEchoMatch = inner.match(/data-echo="([^"]+)"/i);
    const noscriptMatch = inner.match(
      /<noscript>\s*<img[^>]*src="([^"]+)"/i,
    );
    const imgUrl = dataEchoMatch?.[1] || noscriptMatch?.[1] || "";
    if (!imgUrl) return "";

    // Extrair alt text (do primeiro img que não seja loading_v2)
    const altMatch = inner.match(/alt="([^"]+)"/i);
    const alt = altMatch?.[1] || "";

    // Extrair legenda do <h6 class="meta"> dentro de dnd-caption-wrapper
    const captionMatch = inner.match(
      /<h6[^>]*class="[^"]*meta[^"]*"[^>]*>([\s\S]*?)<\/h6>/i,
    );
    let caption = "";
    if (captionMatch) {
      caption = captionMatch[1]
        .replace(/<!--[\s\S]*?-->/g, "") // remove HTML comments
        .replace(/<[^>]*>/g, "") // remove tags
        .replace(/\s*-\s*$/, "") // remove trailing " - " antes do crédito
        .trim();
    }

    const figcaption = caption ? `<figcaption>${caption}</figcaption>` : "";
    return `<figure><img src="${imgUrl}" alt="${alt}">${figcaption}</figure>`;
  });
}

/**
 * Remove lixo editorial que a EBC injeta no HTML do RSS.
 */
function removeJunk(html: string): string {
  let clean = html;

  // Logo da Agência Brasil no topo
  clean = clean.replace(
    /<p[^>]*>\s*<a[^>]*>\s*<img[^>]*alt="Logo Ag[eê]ncia Brasil"[^>]*>\s*<\/a>\s*<\/p>/gi,
    "",
  );

  // Tracking pixels (imagens 1x1)
  clean = clean.replace(
    /<img[^>]*style="[^"]*width:\s*1px[^"]*"[^>]*\/?>/gi,
    "",
  );

  // Placeholders de lazy-loading da EBC (loading_v2.gif)
  clean = clean.replace(
    /<img[^>]*src="[^"]*loading_v2\.gif"[^>]*\/?>/gi,
    "",
  );

  // Promoção WhatsApp — parágrafo inteiro ou link
  clean = clean.replace(
    /<p[^>]*>[\s\S]*?Siga o canal da Ag[eê]ncia Brasil no WhatsApp[\s\S]*?<\/p>/gi,
    "",
  );

  // Seção "Notícias relacionadas" (h3 + ul)
  clean = clean.replace(
    /<h3>\s*Not[ií]cias?\s+relacionadas?[\s\S]*?<\/ul>/gi,
    "",
  );

  // Iframes (vídeos embarcados)
  clean = clean.replace(/<iframe[\s\S]*?<\/iframe>/gi, "");
  // Parágrafos que ficaram só com iframe
  clean = clean.replace(/<p[^>]*>\s*<\/p>/gi, "");

  // Blocos noscript
  clean = clean.replace(/<noscript>[\s\S]*?<\/noscript>/gi, "");

  // Script e style
  clean = clean.replace(/<script[\s\S]*?<\/script>/gi, "");
  clean = clean.replace(/<style[\s\S]*?<\/style>/gi, "");

  // Parágrafos vazios
  clean = clean.replace(/<p[^>]*>\s*(&nbsp;|\u00A0)?\s*<\/p>/gi, "");

  return clean;
}

/**
 * Sanitiza HTML preservando apenas tags semânticas permitidas.
 * Remove todos os atributos exceto href (links) e src/alt (imagens).
 */
function sanitizeTags(html: string): string {
  const allowedTags = new Set([
    "p", "strong", "b", "em", "i", "h2", "h3",
    "blockquote", "a", "ul", "ol", "li",
    "figure", "img", "figcaption", "br",
  ]);

  // Unwrap divs (mantém conteúdo, remove a tag)
  let result = html.replace(/<\/?div[^>]*>/gi, "");

  // Processar tags: manter permitidas, remover o resto
  result = result.replace(/<(\/?)(\w+)([^>]*)>/gi, (full, slash, tag, attrs) => {
    const t = tag.toLowerCase();
    if (!allowedTags.has(t)) return "";

    // Tag de fechamento: retorna limpa
    if (slash) return `</${t}>`;

    // Tags self-closing ou sem atributos necessários
    if (t === "br") return "<br>";

    // Preservar atributos específicos por tag
    let cleanAttrs = "";
    if (t === "a") {
      const href = attrs.match(/href="([^"]*)"/i);
      if (href) cleanAttrs = ` href="${href[1]}"`;
    } else if (t === "img") {
      const src = attrs.match(/src="([^"]*)"/i);
      const alt = attrs.match(/alt="([^"]*)"/i);
      if (src) cleanAttrs += ` src="${src[1]}"`;
      if (alt) cleanAttrs += ` alt="${alt[1]}"`;
    }

    return `<${t}${cleanAttrs}>`;
  });

  return result;
}

/**
 * Normaliza o corpo HTML do RSS para HTML semântico limpo.
 * Pipeline: decode entities → remover lixo → transformar imagens →
 *           sanitizar tags → normalizar formatação → limpar.
 */
export function normalizeBody(rawHtml: string): string {
  let html = decodeHtmlEntities(rawHtml);

  // 1. Transformar imagens inline da EBC antes de qualquer limpeza
  html = transformInlineImages(html);

  // 2. Remover lixo editorial
  html = removeJunk(html);

  // 3. Sanitizar: manter apenas tags permitidas, limpar atributos
  html = sanitizeTags(html);

  // 4. Normalizar: <b> → <strong>, <i> → <em>
  html = html
    .replace(/<b>/gi, "<strong>")
    .replace(/<\/b>/gi, "</strong>")
    .replace(/<i>/gi, "<em>")
    .replace(/<\/i>/gi, "</em>");

  // 5. Limpar whitespace excessivo entre tags
  html = html
    .replace(/>\s+</g, "><")
    .replace(/<p><\/p>/g, "")
    .replace(/<blockquote>\s*<\/blockquote>/g, "")
    .trim();

  // 6. Compatibilidade: limpa marcadores antigos §BOLD§
  html = html
    .replace(/§BOLD§([\s\S]*?)§\/BOLD§/g, "<strong>$1</strong>")
    .replace(/§\/?BOLD§/g, "");

  return html;
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
