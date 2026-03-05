// ── VALUE OBJECT EDIÇÃO ─────────────────────────────────────────
// Regras de negócio da edição da newsletter. Zero dependências externas.

import type { Frequency, ArticleRecord, NewsItem } from "./ports.ts";

/**
 * Calcula a data de início da janela temporal baseada na frequência.
 */
export function timeSince(frequency: Frequency, now: Date = new Date()): Date {
  const ms = now.getTime();

  switch (frequency) {
    case "realtime":
      return new Date(ms - 15 * 60 * 1000);
    case "daily":
      return new Date(ms - 24 * 60 * 60 * 1000);
    case "weekly":
      return new Date(ms - 7 * 24 * 60 * 60 * 1000);
  }
}

/**
 * Formata horário de publicação no formato "14h30".
 */
export function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  const h = d.getHours().toString().padStart(2, "0");
  const m = d.getMinutes().toString().padStart(2, "0");
  return `${h}h${m}`;
}

/**
 * Converte ArticleRecords em NewsItems para o template de email.
 */
export function toNewsItems(articles: ArticleRecord[]): NewsItem[] {
  return articles.map((a) => ({
    id: a.id,
    category: a.category,
    title: a.title,
    time: formatTime(a.published_at),
  }));
}

/**
 * Gera o subject do email baseado na frequência e artigos.
 */
export function buildSubject(
  frequency: Frequency,
  items: NewsItem[],
): string {
  switch (frequency) {
    case "realtime":
      return items[0].title;
    case "daily":
      return "Carta Brasil — Resumo do dia";
    case "weekly":
      return "Carta Brasil — Resumo da semana";
  }
}
