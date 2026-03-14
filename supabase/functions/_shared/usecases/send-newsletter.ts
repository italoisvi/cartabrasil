// ── CASO DE USO: ENVIAR NEWSLETTER ──────────────────────────────
// Orquestra: buscar assinantes → buscar artigos → filtrar → montar email → enviar.
// Depende apenas de portas (interfaces) e do domínio.

import type {
  SubscriberRepository,
  ArticleRepository,
  EmailSender,
  NewsItem,
  Frequency,
} from "../domain/ports.ts";
import { filterArticlesByPreferences } from "../domain/subscriber.ts";
import { timeSince, toNewsItems, buildSubject } from "../domain/edition.ts";

interface SendNewsletterDeps {
  subscriberRepo: SubscriberRepository;
  articleRepo: ArticleRepository;
  emailSender: EmailSender;
  buildEmailHtml: (
    items: NewsItem[],
    baseUrl: string,
    email: string,
  ) => string;
  siteUrl: string;
}

interface SendNewsletterResult {
  ok: true;
  sent: number;
  failed: number;
  articlesCount: number;
  reason?: string;
}

export class SendNewsletterUseCase {
  private subscriberRepo: SubscriberRepository;
  private articleRepo: ArticleRepository;
  private emailSender: EmailSender;
  private buildEmailHtml: SendNewsletterDeps["buildEmailHtml"];
  private siteUrl: string;

  constructor(deps: SendNewsletterDeps) {
    this.subscriberRepo = deps.subscriberRepo;
    this.articleRepo = deps.articleRepo;
    this.emailSender = deps.emailSender;
    this.buildEmailHtml = deps.buildEmailHtml;
    this.siteUrl = deps.siteUrl;
  }

  async execute(frequency: Frequency): Promise<SendNewsletterResult> {
    const subscribers =
      await this.subscriberRepo.findActiveByFrequency(frequency);

    if (!subscribers.length) {
      return { ok: true, sent: 0, failed: 0, articlesCount: 0, reason: "Nenhum assinante encontrado" };
    }

    const since = timeSince(frequency);
    // Usar created_at (momento da coleta) em vez de published_at
    // pois artigos são publicados horas antes de serem coletados pelo RSS
    const articles = await this.articleRepo.findRecent(since, 20, "created_at");

    if (!articles.length) {
      return { ok: true, sent: 0, failed: 0, articlesCount: 0, reason: "Nenhum artigo novo no período" };
    }

    let sent = 0;
    let failed = 0;

    for (const sub of subscribers) {
      const filtered = filterArticlesByPreferences(
        articles,
        sub.categories,
      );
      if (filtered.length === 0) continue;

      const newsItems = toNewsItems(filtered);
      const subject = buildSubject(frequency, newsItems);
      const html = this.buildEmailHtml(newsItems, this.siteUrl, sub.email);

      const ok = await this.emailSender.send(sub.email, subject, html);
      if (ok) sent++;
      else failed++;
    }

    return { ok: true, sent, failed, articlesCount: articles.length };
  }
}
