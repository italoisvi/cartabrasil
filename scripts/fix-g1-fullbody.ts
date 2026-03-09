/**
 * Script para re-processar artigos do G1 já salvos no banco.
 *
 * O que faz:
 *   1. Busca o corpo completo da página do G1 (RSS trazia só resumo)
 *   2. Re-normaliza com normalizeBody (limpa sujeiras restantes)
 *   3. Extrai image_caption se ausente
 *
 * Uso:
 *   deno run --allow-net --allow-env scripts/fix-g1-fullbody.ts
 *
 * Variáveis de ambiente necessárias:
 *   SUPABASE_URL       — URL do projeto Supabase
 *   SUPABASE_KEY       — Service Role Key
 *
 * Flags opcionais:
 *   --dry-run          — Mostra o que seria feito sem atualizar o banco
 *   --limit=N          — Processa apenas N artigos (para teste)
 *   --skip-fetch       — Não busca página, apenas re-normaliza body existente
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { normalizeBody } from "../supabase/functions/_shared/domain/article.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_KEY = Deno.env.get("SUPABASE_KEY");

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Defina SUPABASE_URL e SUPABASE_KEY (service role key)");
  Deno.exit(1);
}

const args = Deno.args;
const dryRun = args.includes("--dry-run");
const skipFetch = args.includes("--skip-fetch");
const limitArg = args.find((a) => a.startsWith("--limit="));
const limit = limitArg ? parseInt(limitArg.split("=")[1]) : 0;

if (dryRun) console.log("*** MODO DRY-RUN — nenhuma alteração será feita ***\n");
if (skipFetch) console.log("*** SKIP-FETCH — apenas re-normaliza body existente ***\n");

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── Extrair crédito da foto do G1 ──────────────────────────────

function extractG1ImageCaption(bodyText: string): string | null {
  const head = bodyText.slice(0, 400);

  const divMatch = head.match(
    /((?:Divulga[çc][aã]o|Reprodu[çc][aã]o|Arquivo|Acervo)\s*\/\s*[^\n]{2,50}?)(?=\s+[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ])/i,
  );
  if (divMatch) return divMatch[1].trim();

  const agencyMatch = head.match(
    /((?:REUTERS|AFP|AP Photo|EFE|EPA|EBC)\s*\/\s*[^\n]{2,40}?)(?=\s+[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ])/i,
  );
  if (agencyMatch) return agencyMatch[1].trim();

  const slashMatch = head.match(
    /([A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][a-záàâãéêíóôõúç]+(?:\s+[A-Za-záàâãéêíóôõúçÁÀÂÃÉÊÍÓÔÕÚÇ]+)*\s*\/\s*[^\n]{2,40}?)(?=\s+[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ])/,
  );
  if (slashMatch && slashMatch[1].length < 70) return slashMatch[1].trim();

  const fotoMatch = head.match(
    /(Foto:\s*[^\n]{2,50}?)(?=\s+[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ])/i,
  );
  if (fotoMatch) return fotoMatch[1].trim();

  return null;
}

// ── Buscar corpo completo da página G1 ───────────────────────

function toAmpUrl(url: string): string {
  return url.replace(/^(https?:\/\/g1\.globo\.com)\//, "$1/google/amp/");
}

async function fetchG1FullBody(articleUrl: string): Promise<string | null> {
  try {
    const ampUrl = toAmpUrl(articleUrl);
    const res = await globalThis.fetch(ampUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; CartaBrasil/1.0)" },
    });
    if (!res.ok) return null;
    const html = await res.text();

    const chunks: string[] = [];
    const allBlocks =
      /<div[^>]*data-block-type="([^"]*)"[^>]*>([\s\S]*?)(?=<div[^>]*data-block-type="|<div[^>]*class="[^"]*bstn-fd|$)/gi;

    let block;
    while ((block = allBlocks.exec(html)) !== null) {
      const blockType = block[1];
      const blockContent = block[2];

      if (blockType === "playlist" || blockType === "ads" || blockType === "summary") continue;

      if (blockType === "raw") {
        if (/Veja\s+(?:mais|v[ií]deos)|Saiba\s+mais|Leia\s+(?:mais|tamb[eé]m)/i.test(blockContent)) break;
        if (/whatsapp\.com|Clique aqui para seguir|Siga o canal/i.test(blockContent)) continue;
        const interMatch = blockContent.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i);
        if (interMatch) {
          const text = interMatch[1].replace(/<[^>]*>/g, "").trim();
          if (text) chunks.push(`<h2>${text}</h2>`);
        }
        continue;
      }

      if (blockType === "unstyled") {
        const pMatch = blockContent.match(/<p[^>]*class="[^"]*content-text[^"]*"[^>]*>([\s\S]*?)<\/p>/i)
          || blockContent.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
        if (pMatch) {
          const text = pMatch[1].trim();
          if (text) chunks.push(`<p>${text}</p>`);
        } else {
          const plainText = blockContent.replace(/<[^>]*>/g, "").trim();
          if (plainText) chunks.push(`<p>${plainText}</p>`);
        }
        continue;
      }

      if (blockType === "backstage-photo") {
        const ampImgMatch = blockContent.match(/<amp-img[^>]*\bsrc="([^"]+)"[^>]*>/i);
        const imgUrl = ampImgMatch?.[1] || "";
        const captionMatch = blockContent.match(/<p[^>]*class="[^"]*content-media__description[^"]*"[^>]*>([\s\S]*?)<\/p>/i);
        let caption = captionMatch?.[1]?.trim() || "";
        caption = caption.replace(/^\d+\s+de\s+\d+\s+/i, "");
        if (imgUrl) {
          const figcaption = caption ? `<figcaption>${caption}</figcaption>` : "";
          chunks.push(`<figure><img src="${imgUrl}" alt="">${figcaption}</figure>`);
        }
        continue;
      }

      if (blockType === "backstage-video") {
        const thumbMatch = blockContent.match(/itemprop="thumbnailUrl"\s+content="([^"]+)"/i);
        const videoCaption = blockContent.match(/<p[^>]*(?:class="[^"]*codex-caption[^"]*"|itemprop="description")[^>]*>([\s\S]*?)<\/p>/i);
        const iframeMatch = blockContent.match(/<amp-iframe[^>]*\bsrc="([^"]+)"[^>]*>/i);
        if (iframeMatch) {
          const cap = videoCaption?.[1]?.trim() || "";
          const figcaption = cap ? `<figcaption>${cap}</figcaption>` : "";
          chunks.push(`<figure class="video-embed"><iframe src="${iframeMatch[1]}" allowfullscreen></iframe>${figcaption}</figure>`);
        } else if (thumbMatch) {
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

// ── Buscar artigos do G1 ───────────────────────────────────────

let query = sb
  .from("articles")
  .select("id, original_url, body, image_caption, source_name")
  .eq("source_name", "G1")
  .order("published_at", { ascending: false });

if (limit > 0) query = query.limit(limit);

const { data: articles, error } = await query;

if (error) {
  console.error("Erro ao buscar artigos:", error.message);
  Deno.exit(1);
}

console.log(`Encontrados ${articles.length} artigos do G1.\n`);

let totalUpdated = 0;
let totalSkipped = 0;
let totalFailed = 0;
let totalFetchOk = 0;

for (const article of articles) {
  const shortId = article.id.slice(0, 8);
  const shortUrl = (article.original_url || "").replace(
    "https://g1.globo.com",
    "",
  );

  if (!article.body && !article.original_url) {
    totalSkipped++;
    continue;
  }

  let rawBody = article.body || "";
  let fetchedFullBody = false;

  // Tentar buscar corpo completo da página
  if (!skipFetch && article.original_url) {
    const fullBody = await fetchG1FullBody(article.original_url);
    // Só usar AMP se tiver texto real (não só imagens)
    if (fullBody && /<p>[^<]{10,}/i.test(fullBody) && fullBody.length > rawBody.length) {
      rawBody = fullBody;
      fetchedFullBody = true;
      totalFetchOk++;
    }
    // Delay para não sobrecarregar o servidor
    await new Promise((r) => setTimeout(r, 500));
  }

  // Limpar CDATA e re-normalizar
  let newBody = rawBody
    .replace(/<!\[CDATA\[/g, "")
    .replace(/\]\]>/g, "");
  newBody = normalizeBody(newBody);

  const needsBodyFix = newBody !== article.body;

  // Extrair caption se não existir
  const rawText = rawBody.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  const newCaption = article.image_caption ? null : extractG1ImageCaption(rawText);
  const needsCaptionFix = newCaption !== null;

  if (!needsBodyFix && !needsCaptionFix) {
    console.log(`[${shortId}] ${shortUrl} — sem mudanças`);
    totalSkipped++;
    continue;
  }

  const changes: string[] = [];
  if (fetchedFullBody) changes.push("full-body");
  if (needsBodyFix) changes.push("body");
  if (needsCaptionFix) changes.push(`caption="${newCaption}"`);
  console.log(`[${shortId}] ${shortUrl} — ${changes.join(", ")}`);

  if (!dryRun) {
    const update: Record<string, string> = {};
    if (needsBodyFix) update.body = newBody;
    if (needsCaptionFix) update.image_caption = newCaption!;

    const { error: updateError } = await sb
      .from("articles")
      .update(update)
      .eq("id", article.id);

    if (updateError) {
      console.log(`  ERRO no update: ${updateError.message}`);
      totalFailed++;
      continue;
    }
  }

  totalUpdated++;
}

console.log("\n" + "─".repeat(50));
console.log(
  `Concluído: ${totalUpdated} corrigidos (${totalFetchOk} com corpo da página), ${totalSkipped} sem mudança, ${totalFailed} erros.`,
);
if (dryRun) console.log("(dry-run — nada foi salvo)");
