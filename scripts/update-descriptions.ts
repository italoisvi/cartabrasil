/**
 * Script para atualizar a description dos artigos existentes
 * buscando a "linha fina" (subtítulo) direto da página da Agência Brasil.
 *
 * Uso:
 *   deno run --allow-net --allow-env scripts/update-descriptions.ts
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

function extractLinhaFina(html: string): string | null {
  const match = html.match(/<div[^>]*class="[^"]*linha-fina-noticia[^"]*"[^>]*>\s*([\s\S]*?)\s*<\/div>/i);
  if (match) {
    return match[1].replace(/<[^>]*>/g, "").trim() || null;
  }
  return null;
}

// Buscar artigos
let query = sb
  .from("articles")
  .select("id, original_url, description")
  .not("original_url", "is", null)
  .order("published_at", { ascending: false });

if (limit > 0) query = query.limit(limit);

const { data: articles, error } = await query;

if (error) {
  console.error("Erro ao buscar artigos:", error.message);
  Deno.exit(1);
}

console.log(`Encontrados ${articles.length} artigos.\n`);

let totalUpdated = 0;
let totalSkipped = 0;
let totalFailed = 0;

for (const article of articles) {
  const shortUrl = article.original_url.replace("https://agenciabrasil.ebc.com.br", "");
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
    const linhaFina = extractLinhaFina(pageHtml);

    if (!linhaFina) {
      console.log("linha fina não encontrada - pulando");
      totalSkipped++;
      continue;
    }

    if (linhaFina === article.description) {
      console.log("já está correto");
      totalSkipped++;
      continue;
    }

    console.log(`"${linhaFina.slice(0, 60)}${linhaFina.length > 60 ? "..." : ""}"`);

    if (!dryRun) {
      const { error: updateError } = await sb
        .from("articles")
        .update({ description: linhaFina })
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
