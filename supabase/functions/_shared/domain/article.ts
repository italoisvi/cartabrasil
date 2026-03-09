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
 * Converte atributos de lazy-loading do G1 para src padrão.
 * G1 usa data-src (ou data-echo) no lugar de src para imagens inline.
 */
function fixLazyImages(html: string): string {
  // data-src="URL" → src="URL" (quando src está ausente ou é placeholder)
  let result = html.replace(
    /<img([^>]*?)data-src="([^"]+)"([^>]*?)>/gi,
    (_match, before: string, dataSrc: string, after: string) => {
      // Se já tem src real (não placeholder), manter
      const hasSrc = /src="(?!data:)[^"]+"/i.test(before + after);
      if (hasSrc) return _match;
      return `<img${before}src="${dataSrc}"${after}>`;
    },
  );
  // Mesmo para data-echo (EBC e alguns G1 antigos)
  result = result.replace(
    /<img([^>]*?)data-echo="([^"]+)"([^>]*?)>/gi,
    (_match, before: string, dataEcho: string, after: string) => {
      const hasSrc = /src="(?!data:)[^"]+"/i.test(before + after);
      if (hasSrc) return _match;
      return `<img${before}src="${dataEcho}"${after}>`;
    },
  );
  // Remover prefixo "N de N " das figcaptions do G1 (ex: "2 de 2 Edson Delgado...")
  result = result.replace(
    /(<figcaption[^>]*>)\s*\d+\s+de\s+\d+\s+/gi,
    "$1",
  );
  return result;
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

  // Imagem hero do G1 no início do description (já capturada via media:content)
  clean = clean.replace(
    /^\s*<img[^>]*glbimg\.com[^>]*\/?>\s*(?:<br\s*\/?>)?\s*/i,
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

  // Promoção WhatsApp — EBC (bloco <p> inteiro)
  clean = clean.replace(
    /<p[^>]*>[\s\S]*?Siga o canal da Ag[eê]ncia Brasil no WhatsApp[\s\S]*?<\/p>/gi,
    "",
  );

  // Promoção WhatsApp/redes sociais do G1 — remover bloco <p> ou <a> inteiro
  // Padrão: <p>...<a href="...">✅Clique aqui para seguir o canal do g1 ... no WhatsApp</a>...</p>
  clean = clean.replace(
    /<p[^>]*>[\s\S]*?(?:Siga o canal|Clique aqui para seguir|Participe do canal)[\s\S]*?WhatsApp[\s\S]*?<\/p>/gi,
    "",
  );
  clean = clean.replace(
    /<a[^>]*>[\s\S]*?(?:Siga o canal|Clique aqui para seguir|Participe do canal)[\s\S]*?WhatsApp[\s\S]*?<\/a>/gi,
    "",
  );
  // Texto solto (sem wrapper)
  clean = clean.replace(
    /[✅📲📳]?\s*(?:Siga o canal|Clique aqui para seguir|Participe do canal)\s+d[eo]\s+g1[\s\S]*?WhatsApp/gi,
    "",
  );

  // Promoção redes sociais do G1 — remover bloco <p> inteiro
  clean = clean.replace(
    /<p[^>]*>[\s\S]*?Siga a p[aá]gina d[eo] g1[\s\S]{0,60}(?:Instagram|Telegram|Facebook)[\s\S]*?<\/p>/gi,
    "",
  );
  clean = clean.replace(
    /[📲📳🔲]?\s*Siga a p[aá]gina d[eo] g1[\s\S]{0,40}(?:Instagram|Telegram|Facebook)/gi,
    "",
  );

  // Promoções genéricas do G1 — bloco <p> inteiro
  clean = clean.replace(
    /<p[^>]*>[\s\S]*?(?:Baixe o app|Acompanhe o|Siga o)\s+g1[\s\S]*?<\/p>/gi,
    "",
  );
  clean = clean.replace(
    /[📲📳🔲✅]?\s*(?:Baixe o app|Acompanhe o|Siga o) g1[\s\S]{0,60}/gi,
    "",
  );
  clean = clean.replace(
    /<p[^>]*>[\s\S]*?Leia mais not[ií]cias sobre[\s\S]{0,40}g1[\s\S]*?<\/p>/gi,
    "",
  );
  clean = clean.replace(
    /Leia mais not[ií]cias sobre[\s\S]{0,40}g1[\s\S]{0,20}\./gi,
    "",
  );

  // Lixo do G1 — headings "Veja vídeos de [região]:" (h2/h3)
  clean = clean.replace(
    /<h[23][^>]*>\s*Veja\s+v[ií]deos\s+d[eo]\s+[\s\S]*?<\/h[23]>/gi,
    "",
  );

  // Lixo do G1 — chamadas para vídeos e telejornais (bloco <p> inteiro)
  clean = clean.replace(
    /<p[^>]*>[\s\S]*?(?:Veja os v[ií]deos|V[ií]deos? mais assistidos?|Reveja os telejornais)[\s\S]*?<\/p>/gi,
    "",
  );
  clean = clean.replace(
    /Veja os v[ií]deos que est[aã]o em alta no g1[\s\S]{0,30}/gi,
    "",
  );
  clean = clean.replace(
    /V[ií]deos? mais assistidos?\s+d[eo]\s+g1[\s\S]{0,30}/gi,
    "",
  );
  clean = clean.replace(
    /VÍDEOS:\s*(?:assista|g1|tudo sobre)[\s\S]{0,60}/gi,
    "",
  );
  clean = clean.replace(
    /Reveja os telejornais[\s\S]{0,30}/gi,
    "",
  );
  clean = clean.replace(
    /LEIA MAIS:[\s\S]*?\n/gi,
    "",
  );

  // Seção "Notícias relacionadas" (h3 + ul)
  clean = clean.replace(
    /<h3>\s*Not[ií]cias?\s+relacionadas?[\s\S]*?<\/ul>/gi,
    "",
  );

  // Embeds do Instagram — converter blockquote em link estilizado
  clean = clean.replace(
    /<blockquote[^>]*class="[^"]*instagram-media[^"]*"[^>]*>[\s\S]*?<\/blockquote>/gi,
    (match) => {
      const hrefMatch = match.match(/data-instgrm-permalink="([^"]+)"/i)
        || match.match(/<a[^>]*href="(https?:\/\/(?:www\.)?instagram\.com\/[^"]+)"/i);
      if (!hrefMatch) return "";
      const url = hrefMatch[1];
      return `<p><a href="${url}">Ver publicação no Instagram</a></p>`;
    },
  );

  // Iframes — preservar vídeos do YouTube e GloboPlay, remover o resto
  clean = clean.replace(/<iframe[\s\S]*?<\/iframe>/gi, (match) => {
    const srcMatch = match.match(/src="([^"]+)"/i);
    if (!srcMatch) return "";
    const src = srcMatch[1];
    if (/youtube\.com\/embed|youtu\.be|globoplay\.globo\.com|player\.globo\.com|s3\.glbimg\.com/i.test(src)) {
      return `<figure class="video-embed"><iframe src="${src}" allowfullscreen></iframe></figure>`;
    }
    return "";
  });
  // Legendas soltas do G1 — texto curto com "— Foto:" (duplica figcaption)
  clean = clean.replace(
    /<p[^>]*>[^<]{0,120}\s*[—–-]\s*Foto:\s*[^<]{0,60}<\/p>/gi,
    "",
  );

  // Parágrafos que ficaram vazios
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
    "figure", "img", "figcaption", "br", "iframe",
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
    } else if (t === "iframe") {
      const src = attrs.match(/src="([^"]*)"/i);
      if (src && /youtube\.com|youtu\.be|globoplay|player\.globo|s3\.glbimg\.com/i.test(src[1])) {
        cleanAttrs = ` src="${src[1]}" allowfullscreen`;
      } else {
        return ""; // remover iframes de fontes não confiáveis
      }
    } else if (t === "figure") {
      const cls = attrs.match(/class="([^"]*)"/i);
      if (cls && cls[1].includes("video-embed")) {
        cleanAttrs = ` class="video-embed"`;
      }
    }

    return `<${t}${cleanAttrs}>`;
  });

  return result;
}

/**
 * Remove parágrafos que duplicam conteúdo de <figcaption> próximos.
 * O G1 e a EBC frequentemente repetem a legenda da foto como texto
 * solto no body, causando duplicação visual.
 */
function removeDuplicateCaptions(html: string): string {
  // Coletar textos de todos os figcaptions
  const captions: string[] = [];
  const captionRegex = /<figcaption>([\s\S]*?)<\/figcaption>/gi;
  let m;
  while ((m = captionRegex.exec(html)) !== null) {
    const text = m[1].replace(/<[^>]*>/g, "").trim().toLowerCase();
    if (text) captions.push(text);
  }

  if (captions.length === 0) return html;

  // Remover <p> curtos cujo texto está contido em algum figcaption
  let result = html.replace(/<p>([^<]{1,100})<\/p>/gi, (match, content) => {
    const text = content.trim().toLowerCase();
    if (text.length < 3) return match;

    for (const caption of captions) {
      if (caption.includes(text)) return "";
    }
    return match;
  });

  // Remover créditos soltos que parecem "Nome/Organização" (curtos, com /)
  // quando já existem dentro de um figcaption
  result = result.replace(/<p>([^<]{1,60})<\/p>/gi, (match, content) => {
    const text = content.trim();
    // Padrão de crédito: "Org/Nome" ou "Nome/Org" com menos de 60 chars
    if (text.length < 60 && /^[A-ZÀ-Ú][\w\sÀ-ú]*\/[\w\sÀ-ú]+$/i.test(text)) {
      for (const caption of captions) {
        if (caption.includes(text.toLowerCase())) return "";
      }
    }
    return match;
  });

  return result;
}

/**
 * Normaliza o corpo HTML do RSS para HTML semântico limpo.
 * Pipeline: decode entities → transformar imagens → remover lixo →
 *           sanitizar tags → normalizar formatação → limpar → dedup legendas.
 */
export function normalizeBody(rawHtml: string): string {
  let html = decodeHtmlEntities(rawHtml);

  // 1. Transformar imagens inline da EBC antes de qualquer limpeza
  html = transformInlineImages(html);

  // 1b. Converter lazy-loading do G1 (data-src → src) e limpar figcaptions
  html = fixLazyImages(html);

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

  // 6. Remover parágrafos que duplicam legendas de fotos
  html = removeDuplicateCaptions(html);

  // 7. Compatibilidade: limpa marcadores antigos §BOLD§
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

  // Fallback: extrair texto puro do body (remover todas as tags HTML)
  const plainBody = normalizedBody
    .replace(/<[^>]*>/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
  if (!plainBody) return "";
  const truncated = plainBody.length > 200 ? plainBody.slice(0, 200) + "…" : plainBody;
  return truncated;
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

/**
 * Extrai a categoria CartaBrasil a partir da URL de um artigo do G1.
 * Analisa o path para mapear editorias do G1 → categorias do domínio.
 */
export function categoryFromG1Url(url: string): Category {
  const path = url.replace(/^https?:\/\/g1\.globo\.com\//, "");

  if (/^economia\b/i.test(path)) return "mercados";
  if (/^mundo\b/i.test(path)) return "internacional";
  if (/^tecnologia\b/i.test(path)) return "tecnologia";
  if (/^politica\b/i.test(path)) return "politica";
  if (/^educacao\b/i.test(path)) return "educacao";
  if (/^(saude|bemestar)\b/i.test(path)) return "saude";
  if (/^(esporte|futebol)\b/i.test(path)) return "esportes";
  if (/^(ciencia|natureza|meio-ambiente)\b/i.test(path)) return "geral";

  // URLs regionais podem conter sub-editoria: /sp/sao-paulo/economia/...
  if (/\/economia\//i.test(path)) return "mercados";
  if (/\/politica\//i.test(path)) return "politica";
  if (/\/educacao\//i.test(path)) return "educacao";
  if (/\/empreendedorismo\//i.test(path)) return "mercados";

  return "geral";
}
