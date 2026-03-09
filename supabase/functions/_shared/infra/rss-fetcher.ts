// ── ADAPTADOR: RSS FETCHER ──────────────────────────────────────
// Implementa a porta RSSFetcher. Busca XML via HTTP e parseia.

import type { RSSFetcher, RSSItem } from "../domain/ports.ts";

function decodeEntities(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function getTagContent(xml: string, tag: string): string {
  const regex = new RegExp(
    `<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>|<${tag}[^>]*>([\\s\\S]*?)</${tag}>`,
    "i",
  );
  const match = xml.match(regex);
  let content = (match?.[1] ?? match?.[2] ?? "").trim();

  // Limpar marcadores CDATA parciais (G1 usa CDATA só no <img>, não no conteúdo todo)
  content = content.replace(/<!\[CDATA\[/g, "").replace(/\]\]>/g, "");

  return content;
}

/**
 * Extrai atributo url de tags como <media:content url="..." />
 */
function getMediaUrl(xml: string): string | null {
  const match = xml.match(/<media:content[^>]*url="([^"]+)"[^>]*\/?>/i);
  return match?.[1] || null;
}

function parseRSSItems(xml: string): RSSItem[] {
  const results: RSSItem[] = [];
  const itemRegex = /<item[\s>]([\s\S]*?)<\/item>/gi;
  let match;

  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const title = decodeEntities(getTagContent(block, "title"));
    const description = getTagContent(block, "description");
    const pubDate = getTagContent(block, "pubDate");
    const creator = getTagContent(block, "dc:creator");
    const imageUrl = getTagContent(block, "imagem-destaque") || null;
    const subtitle = getTagContent(block, "atom:subtitle") || null;
    const mediaUrl = getMediaUrl(block);

    const linkMatch = block.match(/<link[^>]*>([\s\S]*?)<\/link>/i);
    const link = (linkMatch?.[1] ?? "").trim();

    if (title && link) {
      results.push({
        title,
        description,
        link,
        pubDate,
        creator,
        imageUrl,
        subtitle,
        mediaUrl,
      });
    }
  }

  return results;
}

export class HttpRSSFetcher implements RSSFetcher {
  async fetch(url: string): Promise<RSSItem[]> {
    const response = await globalThis.fetch(url);
    const xml = await response.text();
    return parseRSSItems(xml);
  }
}
