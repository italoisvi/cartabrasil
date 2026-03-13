// ── DOMAIN PORTS (interfaces) ───────────────────────────────────
// Zero dependências externas. Apenas tipos.

export type Category =
  | "politica"
  | "mercados"
  | "internacional"
  | "tecnologia"
  | "geral"
  | "direitos-humanos"
  | "educacao"
  | "esportes"
  | "justica"
  | "saude"
  | "economia"
  | "analise";

export type Frequency = "realtime" | "daily" | "weekly";

export interface RSSItem {
  title: string;
  description: string;
  link: string;
  pubDate: string;
  creator: string;
  imageUrl: string | null;
  subtitle: string | null;
  mediaUrl: string | null;
}

export interface ArticleData {
  id: string;
  title: string;
  description: string;
  body: string;
  category: Category;
  imageUrl: string | null;
  imageCaption: string | null;
  sourceName: string;
  sourceUrl: string;
  author: string;
  originalUrl: string;
  publishedAt: string;
}

export interface ArticleRecord {
  id: string;
  title: string;
  category: string;
  published_at: string;
}

export interface SubscriberRecord {
  email: string;
  categories: string[];
}

export interface NewsItem {
  id: string;
  category: string;
  title: string;
  time: string;
}

// ── Portas de Saída (Driven) ──────────────────────────────────

export interface ArticleRepository {
  findByOriginalUrl(url: string): Promise<{ id: string } | null>;
  insert(article: ArticleData): Promise<void>;
  findRecent(since: Date, limit: number, dateField?: string): Promise<ArticleRecord[]>;
}

export interface SubscriberRepository {
  findActiveByFrequency(
    frequency: Frequency,
  ): Promise<SubscriberRecord[]>;
}

export interface RSSFetcher {
  fetch(url: string): Promise<RSSItem[]>;
}

export interface ImageStorage {
  upload(imageUrl: string, articleId: string): Promise<string | null>;
  uploadBodyImages(bodyHtml: string, articleId: string): Promise<string>;
}

export interface EmailSender {
  send(to: string, subject: string, html: string): Promise<boolean>;
}
