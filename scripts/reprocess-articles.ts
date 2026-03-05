/**
 * Script de re-processamento: busca artigos existentes da Agência Brasil
 * pela original_url, extrai o body da página e re-processa com normalizeBody corrigido.
 *
 * Uso:
 *   deno run --allow-net --allow-env scripts/reprocess-articles.ts
 *
 * Variáveis de ambiente necessárias:
 *   SUPABASE_URL       — URL do projeto Supabase
 *   SUPABASE_KEY       — Service Role Key
 *
 * Flags opcionais:
 *   --dry-run          — Mostra o que seria feito sem atualizar o banco
 *   --limit=N          — Processa apenas N artigos (para teste)
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  normalizeBody,
  extractDescription,
} from "../supabase/functions/_shared/domain/article.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_KEY = Deno.env.get("SUPABASE_KEY");

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Defina SUPABASE_URL e SUPABASE_KEY (service role key)");
  Deno.exit(1);
}

const args = Deno.args;
const dryRun = args.includes("--dry-run");
const limitArg = args.find((a) => a.startsWith("--limit="));
const limit = limitArg ? parseInt(limitArg.split("=")[1]) : 0;

if (dryRun) console.log("*** MODO DRY-RUN — nenhuma alteração será feita ***\n");

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── Extrair o body do HTML da página da Agência Brasil ──────────

function extractBodyFromPage(html: string): string | null {
  // A EBC usa Drupal. O conteúdo fica em <div class="conteudo-noticia">.
  // Usamos indexOf para evitar problemas com regex greedy em HTML grande.

  const startMarker = '<div class="conteudo-noticia">';
  const startIdx = html.indexOf(startMarker);
  if (startIdx === -1) return null;

  const contentStart = startIdx + startMarker.length;

  // Encontrar o final: a seção "noticias-relacionadas" ou o fechamento
  // da div conteudo-noticia (procuramos o <!-- Relacionada --> comment ou
  // a div de notícias relacionadas como delimitador).
  const relatedMarker = '<!-- Relacionada -->';
  const relatedIdx = html.indexOf(relatedMarker, contentStart);

  let contentEnd: number;
  if (relatedIdx !== -1) {
    contentEnd = relatedIdx;
  } else {
    // Fallback: pegar até a próxima div de mesmo nível (bloco TTS, etc.)
    // Procurar padrão de fechamento seguro
    const blockEndMarker = '</div>\n\n';
    const blockEnd = html.indexOf(blockEndMarker, contentStart);
    contentEnd = blockEnd !== -1 ? blockEnd : contentStart + 50000;
  }

  const rawContent = html.slice(contentStart, contentEnd).trim();
  return rawContent || null;
}

// ── Upload de imagens do body para o Storage ────────────────────

async function uploadBodyImages(
  bodyHtml: string,
  articleId: string,
): Promise<string> {
  const imgRegex = /<img\s[^>]*src="([^"]+)"[^>]*>/gi;
  const matches = [...bodyHtml.matchAll(imgRegex)];

  if (matches.length === 0) return bodyHtml;

  let result = bodyHtml;
  let index = 0;

  for (const match of matches) {
    const originalUrl = match[1];

    if (originalUrl.includes("supabase.co")) continue;
    if (!originalUrl.startsWith("http")) continue;
    if (originalUrl.includes("loading_v2.gif")) continue;

    try {
      const response = await fetch(originalUrl);
      if (!response.ok) continue;

      const blob = await response.blob();
      const ext = originalUrl.includes(".png") ? "png" : "jpg";
      const path = `${articleId}_body_${index}.${ext}`;

      if (!dryRun) {
        const { error } = await sb.storage
          .from("article-images")
          .upload(path, blob, {
            contentType: blob.type || `image/${ext}`,
            upsert: true,
          });

        if (error) {
          console.log(`    img upload falhou: ${error.message}`);
          continue;
        }

        const {
          data: { publicUrl },
        } = sb.storage.from("article-images").getPublicUrl(path);

        result = result.replaceAll(originalUrl, publicUrl);
      }
      index++;
      console.log(`    img ${index}: OK`);
    } catch (err) {
      console.log(`    img erro: ${(err as Error).message}`);
    }
  }

  return result;
}

// ── Buscar artigos da Agência Brasil ────────────────────────────

let query = sb
  .from("articles")
  .select("id, original_url, body, description")
  .eq("source_name", "Agência Brasil")
  .not("original_url", "is", null)
  .order("published_at", { ascending: false });

if (limit > 0) query = query.limit(limit);

const { data: articles, error } = await query;

if (error) {
  console.error("Erro ao buscar artigos:", error.message);
  Deno.exit(1);
}

console.log(`Encontrados ${articles.length} artigos da Agência Brasil.\n`);

let totalUpdated = 0;
let totalSkipped = 0;
let totalFailed = 0;

for (const article of articles) {
  const shortUrl = article.original_url.replace("https://agenciabrasil.ebc.com.br", "");
  const encoder = new TextEncoder();
  Deno.stdout.writeSync(encoder.encode(`[${article.id.slice(0, 8)}] ${shortUrl} ... `));

  try {
    // Buscar a página original
    const response = await fetch(article.original_url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; CartaBrasil/1.0)",
        "Accept": "text/html",
      },
    });

    if (!response.ok) {
      console.log(`HTTP ${response.status} - pulando`);
      totalSkipped++;
      continue;
    }

    const pageHtml = await response.text();

    // Extrair body do HTML da página
    const rawBody = extractBodyFromPage(pageHtml);
    if (!rawBody) {
      console.log("body não encontrado na página - pulando");
      totalSkipped++;
      continue;
    }

    // Processar com normalizeBody corrigido
    let newBody = normalizeBody(rawBody);

    // Upload de imagens inline para o Storage
    newBody = await uploadBodyImages(newBody, article.id);

    // Gerar nova description
    const newDescription = extractDescription(rawBody, newBody);

    // Verificar se mudou algo significativo
    const oldBodyClean = (article.body || "").replace(/\s+/g, " ").trim();
    const newBodyClean = newBody.replace(/\s+/g, " ").trim();

    if (oldBodyClean === newBodyClean) {
      console.log("sem mudanças");
      totalSkipped++;
      continue;
    }

    // Verificar se o novo body tem imagens que o antigo não tinha
    const oldImgCount = (article.body || "").match(/<img /gi)?.length || 0;
    const newImgCount = newBody.match(/<img /gi)?.length || 0;
    const hasFigures = /<figure>/.test(newBody);

    console.log(
      `body atualizado (imgs: ${oldImgCount} -> ${newImgCount}, figures: ${hasFigures ? "sim" : "não"})`,
    );

    if (!dryRun) {
      const { error: updateError } = await sb
        .from("articles")
        .update({ body: newBody, description: newDescription })
        .eq("id", article.id);

      if (updateError) {
        console.log(`  ERRO no update: ${updateError.message}`);
        totalFailed++;
        continue;
      }
    }

    totalUpdated++;
  } catch (err) {
    console.log(`ERRO: ${(err as Error).message}`);
    totalFailed++;
  }

  // Delay de 500ms para não sobrecarregar o servidor da EBC
  await new Promise((r) => setTimeout(r, 500));
}

console.log("\n" + "─".repeat(50));
console.log(
  `Concluído: ${totalUpdated} atualizados, ${totalSkipped} sem mudança, ${totalFailed} erros.`,
);
if (dryRun) console.log("(dry-run — nada foi salvo)");
