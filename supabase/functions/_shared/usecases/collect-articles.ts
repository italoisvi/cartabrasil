// ── CASO DE USO: COLETAR ARTIGOS ────────────────────────────────
// Orquestra: buscar RSS → deduplicar → upload imagem → normalizar → inserir.
// Depende apenas de portas (interfaces) e do domínio.

import type {
  RSSFetcher,
  ArticleRepository,
  ImageStorage,
  Category,
} from "../domain/ports.ts";
import {
  normalizeBody,
  extractDescription,
  buildImageCaption,
  categoryFromG1Url,
  generateSlug,
} from "../domain/article.ts";

/**
 * Extrai crédito da foto do G1 a partir do texto bruto da description.
 * Busca padrões comuns de crédito nos primeiros 400 chars do texto plano.
 */
function extractG1ImageCaption(rawDescription: string): string | null {
  // Remover tags HTML, deixar só texto
  const text = rawDescription.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  // Procurar apenas nos primeiros 400 chars (crédito fica no início)
  const head = text.slice(0, 400);

  // Padrão 1: "Divulgação/Org", "Reprodução/TV Globo", "Arquivo/Org"
  const divMatch = head.match(
    /((?:Divulga[çc][aã]o|Reprodu[çc][aã]o|Arquivo|Acervo)\s*\/\s*[^\n]{2,50}?)(?=\s+[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ])/i,
  );
  if (divMatch) return divMatch[1].trim();

  // Padrão 2: "REUTERS/Nome", "AFP/Nome", "AP Photo/Nome"
  const agencyMatch = head.match(
    /((?:REUTERS|AFP|AP Photo|EFE|EPA|EBC)\s*\/\s*[^\n]{2,40}?)(?=\s+[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ])/i,
  );
  if (agencyMatch) return agencyMatch[1].trim();

  // Padrão 3: "Nome Sobrenome/Organização" (crédito com /)
  const slashMatch = head.match(
    /([A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][a-záàâãéêíóôõúç]+(?:\s+[A-Za-záàâãéêíóôõúçÁÀÂÃÉÊÍÓÔÕÚÇ]+)*\s*\/\s*[^\n]{2,40}?)(?=\s+[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ])/,
  );
  if (slashMatch && slashMatch[1].length < 70) return slashMatch[1].trim();

  // Padrão 4: "Foto: Nome" (menos comum no G1, mas existe)
  const fotoMatch = head.match(
    /(Foto:\s*[^\n]{2,50}?)(?=\s+[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ])/i,
  );
  if (fotoMatch) return fotoMatch[1].trim();

  return null;
}

/**
 * Limpa a description suja da Agência Brasil para uso como resumo.
 * Remove blocos "Notícias relacionadas", tracking pixels, logos SVG,
 * links da EBC e strip de HTML, retornando texto puro truncado.
 */
function cleanAgenciaBrasilDescription(html: string): string {
  let clean = html;
  // 1. Remover blocos "Notícias relacionadas" (h3 + ul)
  clean = clean.replace(/<h3[^>]*>\s*Not[ií]cias?\s+relacionadas?[\s\S]*?<\/ul>/gi, "");
  // 2. Remover tracking pixels (imagens 1x1)
  clean = clean.replace(/<img[^>]*style="[^"]*width:\s*1px[^"]*"[^>]*\/?>/gi, "");
  // 3. Remover logo SVG da Agência Brasil
  clean = clean.replace(/<img[^>]*alt="Logo Ag[eê]ncia Brasil"[^>]*\/?>/gi, "");
  clean = clean.replace(/<img[^>]*logo[-_]?agenciabrasil[^>]*\/?>/gi, "");
  // 4. Remover links/âncoras da Agência Brasil (promoções, WhatsApp)
  clean = clean.replace(/<a[^>]*agenciabrasil[^>]*>[\s\S]*?<\/a>/gi, "");
  // 5. Remover blocos de promoção WhatsApp
  clean = clean.replace(/<p[^>]*>[\s\S]*?Siga o canal[\s\S]*?WhatsApp[\s\S]*?<\/p>/gi, "");
  // 6. Remover noscript, script, style
  clean = clean.replace(/<(?:noscript|script|style)[\s\S]*?<\/(?:noscript|script|style)>/gi, "");
  // 7. Remover blocos dnd-widget-wrapper (imagens inline EBC)
  clean = clean.replace(/<div[^>]*class="[^"]*dnd-widget-wrapper[^"]*"[^>]*>[\s\S]*?<\/div>\s*<\/div>/gi, "");
  // 8. Strip de HTML restante
  clean = clean.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  // 9. Truncar em 500 chars
  if (clean.length > 500) clean = clean.substring(0, 500).replace(/\s+\S*$/, "") + "…";
  return clean;
}

/**
 * Converte URL do G1 para a versão AMP (Server-Side Rendered).
 * A página normal do G1 usa CSR (JavaScript) — o corpo do artigo NÃO
 * está no HTML estático. A versão AMP tem tudo renderizado no servidor.
 *
 * Normal: https://g1.globo.com/ms/.../slug.ghtml
 * AMP:    https://g1.globo.com/google/amp/ms/.../slug.ghtml
 */
function toAmpUrl(url: string): string {
  return url.replace(
    /^(https?:\/\/g1\.globo\.com)\//,
    "$1/google/amp/",
  );
}

/**
 * Busca o corpo completo de um artigo do G1 via página AMP.
 *
 * Estrutura AMP do G1:
 *   - Texto: <div class="content-text"><p class="content-text__container">...</p></div>
 *   - Imagens: <amp-img src="..." alt="..."> dentro de <div data-block-type="backstage-photo">
 *   - Legendas: <p class="content-media__description">...</p>
 *   - Vídeos: <amp-iframe src="..."> dentro de <div data-block-type="backstage-video">
 *   - Fim: blocos com "Veja mais", "Saiba mais" ou data-block-type="playlist"
 */
async function fetchG1FullBody(articleUrl: string): Promise<string | null> {
  try {
    const ampUrl = toAmpUrl(articleUrl);
    const res = await globalThis.fetch(ampUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; CartaBrasil/1.0)" },
    });
    if (!res.ok) return null;
    const html = await res.text();

    // Extrair todos os blocos de conteúdo (chunks) do corpo do artigo
    // Cada chunk é um <div id="chunk-..."> com data-block-type
    const chunks: string[] = [];

    // Regex para extrair blocos de texto (parágrafos)
    const textBlockRegex =
      /<div[^>]*data-block-type="unstyled"[^>]*>[\s\S]*?<p[^>]*class="[^"]*content-text__container[^"]*"[^>]*>([\s\S]*?)<\/p>[\s\S]*?<\/div>/gi;
    let m;

    // Regex para extrair blocos de foto
    const photoBlockRegex =
      /<div[^>]*data-block-type="backstage-photo"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/gi;

    // Regex para extrair intertítulos
    const intertitleRegex =
      /<div[^>]*class="[^"]*content-intertitle[^"]*"[^>]*>\s*<h2>([\s\S]*?)<\/h2>\s*<\/div>/gi;

    // Processar o HTML sequencialmente para manter a ordem dos blocos
    // Usar um regex que captura todos os chunks na ordem
    const chunkRegex =
      /<div[^>]*(?:id="chunk-[^"]*")[^>]*>[\s\S]*?(?:<\/div>\s*){1,4}/gi;

    // Abordagem mais robusta: extrair bloco por bloco na ordem
    const allBlocks =
      /<div[^>]*data-block-type="([^"]*)"[^>]*>([\s\S]*?)(?=<div[^>]*data-block-type="|<div[^>]*class="[^"]*bstn-fd|$)/gi;

    let block;
    while ((block = allBlocks.exec(html)) !== null) {
      const blockType = block[1];
      const blockContent = block[2];

      // Parar ao encontrar blocos de lixo
      if (blockType === "playlist" || blockType === "ads") continue;
      if (blockType === "summary") continue;

      // Parar se for um intertítulo de "Veja mais", "Saiba mais", etc.
      if (blockType === "raw") {
        if (/Veja\s+(?:mais|v[ií]deos)|Saiba\s+mais|Leia\s+(?:mais|tamb[eé]m)/i.test(blockContent)) {
          break; // Fim do conteúdo editorial
        }
        if (/whatsapp\.com|Clique aqui para seguir|Siga o canal/i.test(blockContent)) {
          continue; // Pular blocos de WhatsApp/redes sociais
        }
        // Intertítulos legítimos
        const interMatch = blockContent.match(
          /<h2[^>]*>([\s\S]*?)<\/h2>/i,
        );
        if (interMatch) {
          const text = interMatch[1].replace(/<[^>]*>/g, "").trim();
          if (text) chunks.push(`<h2>${text}</h2>`);
        }
        continue;
      }

      // Bloco de texto (parágrafo)
      if (blockType === "unstyled") {
        // Tentar classe específica primeiro, depois qualquer <p>
        const pMatch = blockContent.match(
          /<p[^>]*class="[^"]*content-text[^"]*"[^>]*>([\s\S]*?)<\/p>/i,
        ) || blockContent.match(
          /<p[^>]*>([\s\S]*?)<\/p>/i,
        );
        if (pMatch) {
          const text = pMatch[1].trim();
          if (text) chunks.push(`<p>${text}</p>`);
        } else {
          // Fallback: extrair texto puro do bloco (sem tags)
          const plainText = blockContent.replace(/<[^>]*>/g, "").trim();
          if (plainText) chunks.push(`<p>${plainText}</p>`);
        }
        continue;
      }

      // Bloco de foto
      if (blockType === "backstage-photo") {
        // Extrair URL da imagem (amp-img src ou srcset)
        const ampImgMatch = blockContent.match(
          /<amp-img[^>]*\bsrc="([^"]+)"[^>]*>/i,
        );
        const imgUrl = ampImgMatch?.[1] || "";

        // Extrair legenda
        const captionMatch = blockContent.match(
          /<p[^>]*class="[^"]*content-media__description[^"]*"[^>]*>([\s\S]*?)<\/p>/i,
        );
        let caption = captionMatch?.[1]?.trim() || "";
        // Remover prefixo "N de N" (ex: "2 de 2 Legenda...")
        caption = caption.replace(/^\d+\s+de\s+\d+\s+/i, "");

        if (imgUrl) {
          const figcaption = caption ? `<figcaption>${caption}</figcaption>` : "";
          chunks.push(`<figure><img src="${imgUrl}" alt="">${figcaption}</figure>`);
        }
        continue;
      }

      // Bloco de vídeo
      if (blockType === "backstage-video") {
        // Extrair thumbnail e ID do vídeo
        const thumbMatch = blockContent.match(
          /itemprop="thumbnailUrl"\s+content="([^"]+)"/i,
        );
        const videoCaption = blockContent.match(
          /<p[^>]*(?:class="[^"]*codex-caption[^"]*"|itemprop="description")[^>]*>([\s\S]*?)<\/p>/i,
        );
        // Extrair URL do iframe AMP
        const iframeMatch = blockContent.match(
          /<amp-iframe[^>]*\bsrc="([^"]+)"[^>]*>/i,
        );

        if (iframeMatch) {
          const src = iframeMatch[1];
          const cap = videoCaption?.[1]?.trim() || "";
          const figcaption = cap ? `<figcaption>${cap}</figcaption>` : "";
          chunks.push(
            `<figure class="video-embed"><iframe src="${src}" allowfullscreen></iframe>${figcaption}</figure>`,
          );
        } else if (thumbMatch) {
          // Fallback: mostrar thumbnail como imagem com legenda
          const cap = videoCaption?.[1]?.trim() || "";
          const figcaption = cap ? `<figcaption>${cap}</figcaption>` : "";
          chunks.push(`<figure><img src="${thumbMatch[1]}" alt="">${figcaption}</figure>`);
        }
        continue;
      }
    }

    if (chunks.length === 0) return null;
    return chunks.join("");
  } catch {
    return null;
  }
}

async function fetchLinhaFina(articleUrl: string): Promise<string | null> {
  try {
    const res = await globalThis.fetch(articleUrl);
    const html = await res.text();
    const match = html.match(/<div[^>]*class="[^"]*linha-fina-noticia[^"]*"[^>]*>\s*([\s\S]*?)\s*<\/div>/i);
    if (match) {
      return match[1].replace(/<[^>]*>/g, "").trim() || null;
    }
    return null;
  } catch {
    return null;
  }
}

interface CollectArticlesDeps {
  rssFetcher: RSSFetcher;
  articleRepo: ArticleRepository;
  imageStorage: ImageStorage;
}

export interface FeedConfig {
  url: string;
  category: Category | null;
  sourceName: string;
}

export class CollectArticlesUseCase {
  private rssFetcher: RSSFetcher;
  private articleRepo: ArticleRepository;
  private imageStorage: ImageStorage;

  constructor(deps: CollectArticlesDeps) {
    this.rssFetcher = deps.rssFetcher;
    this.articleRepo = deps.articleRepo;
    this.imageStorage = deps.imageStorage;
  }

  async execute(feed: FeedConfig): Promise<number> {
    const items = await this.rssFetcher.fetch(feed.url);
    let inserted = 0;

    for (const item of items) {
      const existing = await this.articleRepo.findByOriginalUrl(item.link);
      if (existing) continue;

      const articleId = crypto.randomUUID();

      // Categoria: fixa do feed ou extraída da URL (G1)
      const category = feed.category || categoryFromG1Url(item.link);

      // Imagem: prioriza imagem-destaque (EBC), depois media:content (G1)
      const rawImageUrl = item.imageUrl || item.mediaUrl;
      let imageUrl: string | null = null;
      if (rawImageUrl) {
        imageUrl = await this.imageStorage.upload(rawImageUrl, articleId);
      }

      // Body: para G1, buscar corpo completo da página AMP (tem imagens e vídeos)
      // Só usa o AMP se tiver parágrafos de texto reais — senão mantém o RSS
      let rawBody = item.description;
      if (feed.sourceName === "G1") {
        const fullBody = await fetchG1FullBody(item.link);
        // Verificar se o AMP trouxe texto real (pelo menos 1 parágrafo com 10+ chars)
        if (fullBody && /<p>[^<]{10,}/i.test(fullBody)) {
          rawBody = fullBody;
        }
      }
      let body = normalizeBody(rawBody);
      body = await this.imageStorage.uploadBodyImages(body, articleId);

      // Description: subtitle (G1) > linha-fina (EBC) > limpeza EBC > extração do body
      let description: string | null = item.subtitle;
      if (!description && feed.sourceName === "Agência Brasil") {
        description = await fetchLinhaFina(item.link);
      }
      if (!description && feed.sourceName === "Agência Brasil") {
        const cleaned = cleanAgenciaBrasilDescription(item.description);
        if (cleaned.length > 20) description = cleaned;
      }
      if (!description) {
        description = extractDescription(item.description, body);
      }

      try {
        await this.articleRepo.insert({
          id: articleId,
          title: item.title,
          description,
          body,
          category,
          imageUrl,
          imageCaption: item.creator
            ? buildImageCaption(item.creator)
            : extractG1ImageCaption(item.description),
          sourceName: feed.sourceName,
          sourceUrl: item.link,
          author: item.creator,
          originalUrl: item.link,
          publishedAt: new Date(item.pubDate).toISOString(),
          slug: generateSlug(item.title),
        });
        inserted++;
      } catch (err) {
        console.error("Insert error:", err);
      }
    }

    return inserted;
  }
}
