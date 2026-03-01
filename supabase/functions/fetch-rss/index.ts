import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Mapeamento: feed RSS → categoria do Carta de Notícia
const FEEDS: Record<string, string> = {
  "http://agenciabrasil.ebc.com.br/rss/politica/feed.xml": "politica",
  "http://agenciabrasil.ebc.com.br/rss/economia/feed.xml": "mercados",
  "http://agenciabrasil.ebc.com.br/rss/internacional/feed.xml": "internacional",
  "http://agenciabrasil.ebc.com.br/rss/geral/feed.xml": "geral",
};

interface RSSItem {
  title: string;
  description: string;
  link: string;
  pubDate: string;
  creator: string;
  imageUrl: string | null;
}

function getTagContent(xml: string, tag: string): string {
  const regex = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>|<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i");
  const match = xml.match(regex);
  return (match?.[1] ?? match?.[2] ?? "").trim();
}

function parseRSSItems(xml: string): RSSItem[] {
  const results: RSSItem[] = [];
  const itemRegex = /<item[\s>]([\s\S]*?)<\/item>/gi;
  let match;

  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const title = getTagContent(block, "title");
    const description = getTagContent(block, "description");
    const pubDate = getTagContent(block, "pubDate");
    const creator = getTagContent(block, "dc:creator");
    const imageUrl = getTagContent(block, "imagem-destaque") || null;

    // <link> em RSS geralmente não tem CDATA, pega direto
    const linkMatch = block.match(/<link[^>]*>([\s\S]*?)<\/link>/i);
    const link = (linkMatch?.[1] ?? "").trim();

    if (title && link) {
      results.push({ title, description, link, pubDate, creator, imageUrl });
    }
  }

  return results;
}

async function uploadImage(
  imageUrl: string,
  articleId: string,
): Promise<string | null> {
  try {
    const response = await fetch(imageUrl);
    if (!response.ok) return null;

    const blob = await response.blob();
    const ext = imageUrl.includes(".png") ? "png" : "jpg";
    const path = `${articleId}.${ext}`;

    const { error } = await supabase.storage
      .from("article-images")
      .upload(path, blob, {
        contentType: blob.type || `image/${ext}`,
        upsert: true,
      });

    if (error) {
      console.error("Upload error:", error.message);
      return null;
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from("article-images").getPublicUrl(path);

    return publicUrl;
  } catch (err) {
    console.error("Image fetch error:", err);
    return null;
  }
}

async function fetchAndStore(feedUrl: string, category: string) {
  const response = await fetch(feedUrl);
  const xml = await response.text();
  const items = parseRSSItems(xml);

  let inserted = 0;

  for (const item of items) {
    // Verifica se o artigo já existe (pelo original_url)
    const { data: existing } = await supabase
      .from("articles")
      .select("id")
      .eq("original_url", item.link)
      .maybeSingle();

    if (existing) continue;

    // Gera ID para o artigo
    const articleId = crypto.randomUUID();

    // Faz upload da imagem pro Supabase Storage
    let storedImageUrl: string | null = null;
    if (item.imageUrl) {
      storedImageUrl = await uploadImage(item.imageUrl, articleId);
    }

    // Decodifica HTML entities e depois remove tags HTML
    const decoded = item.description
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
    const cleanDescription = decoded
      .replace(/<[^>]*>/g, " ")
      .replace(/\s{2,}/g, " ")
      .trim();

    const { error } = await supabase.from("articles").insert({
      id: articleId,
      title: item.title,
      description: cleanDescription,
      body: cleanDescription,
      category,
      image_url: storedImageUrl,
      image_caption: item.creator ? `Foto: ${item.creator}` : null,
      source_name: "Agência Brasil",
      source_url: item.link,
      author: item.creator,
      original_url: item.link,
      published_at: new Date(item.pubDate).toISOString(),
    });

    if (error) {
      console.error("Insert error:", error.message);
    } else {
      inserted++;
    }
  }

  return inserted;
}

Deno.serve(async (req) => {
  // Protege com um token simples (opcional)
  const authHeader = req.headers.get("Authorization");
  const expectedToken = Deno.env.get("CRON_SECRET");
  if (expectedToken && authHeader !== `Bearer ${expectedToken}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const results: Record<string, number> = {};

  for (const [feedUrl, category] of Object.entries(FEEDS)) {
    try {
      const count = await fetchAndStore(feedUrl, category);
      results[category] = count;
      console.log(`${category}: ${count} novos artigos`);
    } catch (err) {
      console.error(`Erro no feed ${category}:`, err);
      results[category] = -1;
    }
  }

  return new Response(JSON.stringify({ ok: true, inserted: results }), {
    headers: { "Content-Type": "application/json" },
  });
});
