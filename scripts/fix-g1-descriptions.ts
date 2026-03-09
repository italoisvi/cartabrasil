/**
 * Script para corrigir descriptions sujas dos artigos do G1.
 *
 * Os artigos do G1 foram inseridos com a <description> do RSS, que contém
 * o HTML inteiro do artigo (imagens, texto completo). A description limpa
 * deveria vir do <atom:subtitle>, mas para artigos já salvos, a melhor
 * fonte é a meta tag og:description da página do artigo.
 *
 * Uso:
 *   deno run --allow-net --allow-env scripts/fix-g1-descriptions.ts
 *
 * Variáveis de ambiente necessárias:
 *   SUPABASE_URL       — URL do projeto Supabase
 *   SUPABASE_KEY       — Service Role Key
 *
 * Flags opcionais:
 *   --dry-run          — Mostra o que seria feito sem atualizar o banco
 *   --limit=N          — Processa apenas N artigos (para teste)
 *   --force            — Re-processa mesmo artigos com description curta/limpa
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_KEY = Deno.env.get("SUPABASE_KEY");

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Defina SUPABASE_URL e SUPABASE_KEY (service role key)");
  Deno.exit(1);
}

const args = Deno.args;
const dryRun = args.includes("--dry-run");
const force = args.includes("--force");
const limitArg = args.find((a) => a.startsWith("--limit="));
const limit = limitArg ? parseInt(limitArg.split("=")[1]) : 0;

if (dryRun) console.log("*** MODO DRY-RUN — nenhuma alteração será feita ***\n");

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── Extrair og:description da página do G1 ───────────────────────

function extractOgDescription(html: string): string | null {
  // og:description
  const ogMatch = html.match(
    /<meta[^>]*property="og:description"[^>]*content="([^"]*)"[^>]*\/?>/i,
  ) || html.match(
    /<meta[^>]*content="([^"]*)"[^>]*property="og:description"[^>]*\/?>/i,
  );
  if (ogMatch) {
    const desc = ogMatch[1]
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .trim();
    if (desc.length > 10) return desc;
  }

  // Fallback: meta name="description"
  const metaMatch = html.match(
    /<meta[^>]*name="description"[^>]*content="([^"]*)"[^>]*\/?>/i,
  ) || html.match(
    /<meta[^>]*content="([^"]*)"[^>]*name="description"[^>]*\/?>/i,
  );
  if (metaMatch) {
    const desc = metaMatch[1]
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .trim();
    if (desc.length > 10) return desc;
  }

  return null;
}

// ── Heurística: description parece suja? ─────────────────────────

function descriptionIsDirty(desc: string | null): boolean {
  if (!desc) return true;
  // Contém HTML?
  if (/<[^>]{2,}>/.test(desc)) return true;
  // Contém CDATA?
  if (/CDATA/.test(desc)) return true;
  // Muito longa (descriptions limpas do G1 têm ~80-200 chars)
  if (desc.length > 400) return true;
  // Contém URLs de imagem do G1
  if (/glbimg\.com/i.test(desc)) return true;
  return false;
}

// ── Buscar artigos do G1 ─────────────────────────────────────────

let query = sb
  .from("articles")
  .select("id, original_url, description")
  .eq("source_name", "G1")
  .not("original_url", "is", null)
  .order("published_at", { ascending: false });

if (limit > 0) query = query.limit(limit);

const { data: articles, error } = await query;

if (error) {
  console.error("Erro ao buscar artigos:", error.message);
  Deno.exit(1);
}

console.log(`Encontrados ${articles.length} artigos do G1.\n`);

// Filtrar apenas os que têm description suja (ou todos se --force)
const toProcess = force
  ? articles
  : articles.filter((a: { description: string | null }) => descriptionIsDirty(a.description));

console.log(`${toProcess.length} artigos com description suja para processar.\n`);

let totalUpdated = 0;
let totalSkipped = 0;
let totalFailed = 0;

for (const article of toProcess) {
  const shortUrl = article.original_url.replace("https://g1.globo.com", "");
  const encoder = new TextEncoder();
  Deno.stdout.writeSync(encoder.encode(`[${article.id.slice(0, 8)}] ${shortUrl} ... `));

  try {
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
    const newDescription = extractOgDescription(pageHtml);

    if (!newDescription) {
      console.log("og:description não encontrada - pulando");
      totalSkipped++;
      continue;
    }

    if (newDescription === article.description) {
      console.log("já está correto");
      totalSkipped++;
      continue;
    }

    console.log(`"${newDescription.slice(0, 70)}${newDescription.length > 70 ? "..." : ""}"`);

    if (!dryRun) {
      const { error: updateError } = await sb
        .from("articles")
        .update({ description: newDescription })
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

  // Delay de 300ms para não sobrecarregar
  await new Promise((r) => setTimeout(r, 300));
}

console.log("\n" + "─".repeat(50));
console.log(
  `Concluído: ${totalUpdated} atualizados, ${totalSkipped} sem mudança, ${totalFailed} erros.`,
);
if (dryRun) console.log("(dry-run — nada foi salvo)");
