/**
 * Script para corrigir descriptions sujas dos artigos da Agência Brasil.
 *
 * Prioridade:
 *   1. Busca a "linha fina" (subtítulo) da página original da EBC
 *   2. Se não encontrar, limpa a description existente removendo lixo
 *      (blocos "Notícias relacionadas", tracking pixels, logos, etc.)
 *
 * Uso:
 *   deno run --allow-net --allow-env scripts/fix-ebc-descriptions.ts
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

// ── Extração da linha fina da página da EBC ──────────────────────

function extractLinhaFina(html: string): string | null {
  const match = html.match(
    /<div[^>]*class="[^"]*linha-fina-noticia[^"]*"[^>]*>\s*([\s\S]*?)\s*<\/div>/i,
  );
  if (match) {
    return match[1].replace(/<[^>]*>/g, "").trim() || null;
  }
  return null;
}

// ── Limpeza da description bruta do RSS ──────────────────────────

function cleanAgenciaBrasilDescription(html: string): string {
  let clean = html;
  // 1. Remover blocos "Notícias relacionadas" (h3 + ul)
  clean = clean.replace(/<h3[^>]*>\s*Not[ií]cias?\s+relacionadas?[\s\S]*?<\/ul>/gi, "");
  // 2. Remover tracking pixels (imagens 1x1)
  clean = clean.replace(/<img[^>]*style="[^"]*width:\s*1px[^"]*"[^>]*\/?>/gi, "");
  // 3. Remover logo SVG da Agência Brasil
  clean = clean.replace(/<img[^>]*alt="Logo Ag[eê]ncia Brasil"[^>]*\/?>/gi, "");
  clean = clean.replace(/<img[^>]*logo[-_]?agenciabrasil[^>]*\/?>/gi, "");
  // 4. Remover links/âncoras da Agência Brasil (promoções, WhatsApp)
  clean = clean.replace(/<a[^>]*agenciabrasil[^>]*>[\s\S]*?<\/a>/gi, "");
  // 5. Remover blocos de promoção WhatsApp
  clean = clean.replace(/<p[^>]*>[\s\S]*?Siga o canal[\s\S]*?WhatsApp[\s\S]*?<\/p>/gi, "");
  // 6. Remover noscript, script, style
  clean = clean.replace(/<(?:noscript|script|style)[\s\S]*?<\/(?:noscript|script|style)>/gi, "");
  // 7. Remover blocos dnd-widget-wrapper (imagens inline EBC)
  clean = clean.replace(/<div[^>]*class="[^"]*dnd-widget-wrapper[^"]*"[^>]*>[\s\S]*?<\/div>\s*<\/div>/gi, "");
  // 8. Remover todas as imagens restantes
  clean = clean.replace(/<img[^>]*\/?>/gi, "");
  // 9. Strip de HTML restante
  clean = clean.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  // 10. Truncar em 500 chars (no limite de palavra)
  if (clean.length > 500) clean = clean.substring(0, 500).replace(/\s+\S*$/, "") + "…";
  return clean;
}

// ── Heurística: description parece suja? ─────────────────────────

function descriptionIsDirty(desc: string | null): boolean {
  if (!desc) return true;
  // Contém HTML?
  if (/<[^>]{2,}>/.test(desc)) return true;
  // Contém "Notícias relacionadas"?
  if (/not[ií]cias?\s+relacionadas?/i.test(desc)) return true;
  // Contém tracking/logo?
  if (/width:\s*1px|logo.*agenciabrasil/i.test(desc)) return true;
  // Muito longa (descrições limpas da EBC têm ~100-300 chars)
  if (desc.length > 600) return true;
  return false;
}

// ── Buscar artigos da Agência Brasil ─────────────────────────────

let query = sb
  .from("articles")
  .select("id, original_url, description")
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

// Filtrar apenas os que têm description suja (ou todos se --force)
const toProcess = force
  ? articles
  : articles.filter((a: { description: string | null }) => descriptionIsDirty(a.description));

console.log(`${toProcess.length} artigos com description suja para processar.\n`);

let totalUpdated = 0;
let totalSkipped = 0;
let totalFailed = 0;

for (const article of toProcess) {
  const shortUrl = article.original_url.replace("https://agenciabrasil.ebc.com.br", "");
  const encoder = new TextEncoder();
  Deno.stdout.writeSync(encoder.encode(`[${article.id.slice(0, 8)}] ${shortUrl} ... `));

  try {
    // 1. Tentar buscar linha fina da página
    let newDescription: string | null = null;

    const response = await fetch(article.original_url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; CartaBrasil/1.0)",
        "Accept": "text/html",
      },
    });

    if (response.ok) {
      const pageHtml = await response.text();
      newDescription = extractLinhaFina(pageHtml);
      if (newDescription) {
        console.log(`linha-fina: "${newDescription.slice(0, 60)}${newDescription.length > 60 ? "..." : ""}"`);
      }
    } else {
      console.log(`HTTP ${response.status} - `);
    }

    // 2. Fallback: limpar a description existente
    if (!newDescription && article.description) {
      const cleaned = cleanAgenciaBrasilDescription(article.description);
      if (cleaned.length > 20) {
        newDescription = cleaned;
        console.log(`limpeza: "${cleaned.slice(0, 60)}${cleaned.length > 60 ? "..." : ""}"`);
      }
    }

    if (!newDescription) {
      console.log("sem description válida - pulando");
      totalSkipped++;
      continue;
    }

    // Verificar se mudou
    if (newDescription === article.description) {
      console.log("já está correto");
      totalSkipped++;
      continue;
    }

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

  // Delay de 500ms para não sobrecarregar o servidor da EBC
  await new Promise((r) => setTimeout(r, 500));
}

console.log("\n" + "─".repeat(50));
console.log(
  `Concluído: ${totalUpdated} atualizados, ${totalSkipped} sem mudança, ${totalFailed} erros.`,
);
if (dryRun) console.log("(dry-run — nada foi salvo)");
