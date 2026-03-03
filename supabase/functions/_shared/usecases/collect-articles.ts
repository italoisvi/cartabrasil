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
} from "../domain/article.ts";

interface CollectArticlesDeps {
  rssFetcher: RSSFetcher;
  articleRepo: ArticleRepository;
  imageStorage: ImageStorage;
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

  async execute(feedUrl: string, category: Category): Promise<number> {
    const items = await this.rssFetcher.fetch(feedUrl);
    let inserted = 0;

    for (const item of items) {
      const existing = await this.articleRepo.findByOriginalUrl(item.link);
      if (existing) continue;

      const articleId = crypto.randomUUID();

      let imageUrl: string | null = null;
      if (item.imageUrl) {
        imageUrl = await this.imageStorage.upload(item.imageUrl, articleId);
      }

      const body = normalizeBody(item.description);
      const description = extractDescription(item.description, body);

      try {
        await this.articleRepo.insert({
          id: articleId,
          title: item.title,
          description,
          body,
          category,
          imageUrl,
          imageCaption: buildImageCaption(item.creator),
          sourceName: "Agência Brasil",
          sourceUrl: item.link,
          author: item.creator,
          originalUrl: item.link,
          publishedAt: new Date(item.pubDate).toISOString(),
        });
        inserted++;
      } catch (err) {
        console.error("Insert error:", err);
      }
    }

    return inserted;
  }
}
