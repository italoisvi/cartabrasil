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
  generateSlug,
} from "../domain/article.ts";

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
  category: Category;
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

      const category = feed.category!;

      const rawImageUrl = item.imageUrl;
      let imageUrl: string | null = null;
      if (rawImageUrl) {
        imageUrl = await this.imageStorage.upload(rawImageUrl, articleId);
      }

      let body = normalizeBody(item.description);
      body = await this.imageStorage.uploadBodyImages(body, articleId);

      // Description: linha-fina (EBC) > limpeza da description > extração do body
      let description: string | null = await fetchLinhaFina(item.link);
      if (!description) {
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
          imageCaption: item.creator ? buildImageCaption(item.creator) : null,
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
