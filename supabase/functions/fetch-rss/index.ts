import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { DOMParser } from "https://deno.land/x/deno_dom@v0.1.47/deno-dom-wasm.ts";

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

function parseRSSItems(xml: string): RSSItem[] {
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  if (!doc) return [];

  const items = doc.querySelectorAll("item");
  const results: RSSItem[] = [];

  for (const item of items) {
    const title = item.querySelector("title")?.textContent?.trim() ?? "";
    const description =
      item.querySelector("description")?.textContent?.trim() ?? "";
    const link = item.querySelector("link")?.textContent?.trim() ?? "";
    const pubDate = item.querySelector("pubDate")?.textContent?.trim() ?? "";
    const creator =
      item.getElementsByTagName("dc:creator")[0]?.textContent?.trim() ?? "";
    const imageUrl =
      item.getElementsByTagName("imagem-destaque")[0]?.textContent?.trim() ??
      null;

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

    // Limpa o HTML da description pra texto plano
    const cleanDescription = item.description.replace(/<[^>]*>/g, "").trim();

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
