/**
 * Script para corrigir artigos do G1 já salvos no banco.
 *
 * Corrige:
 *   1. Marcadores CDATA (]]>) no body
 *   2. Imagem hero do G1 duplicada no body
 *   3. Lixo de redes sociais (WhatsApp, Instagram, vídeos)
 *   4. Image caption ausente (extrai crédito do body)
 *
 * Uso:
 *   deno run --allow-net --allow-env scripts/fix-g1-articles.ts
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
import { normalizeBody } from "../supabase/functions/_shared/domain/article.ts";

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

// ── Limpar body do G1 ──────────────────────────────────────────

function fixG1Body(body: string): string {
  let fixed = body;

  // Remover marcadores CDATA residuais
  fixed = fixed.replace(/<!\[CDATA\[/g, "").replace(/\]\]>/g, "");

  // Remover imagem hero do G1 no início
  fixed = fixed.replace(
    /^\s*<img[^>]*glbimg\.com[^>]*\/?>\s*(?:<br\s*\/?>)?\s*/i,
    "",
  );

  // Re-processar com normalizeBody para limpar todo o lixo do G1
  fixed = normalizeBody(fixed);

  return fixed;
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

for (const article of articles) {
  const shortId = article.id.slice(0, 8);
  const shortUrl = (article.original_url || "").replace(
    "https://g1.globo.com",
    "",
  );

  if (!article.body) {
    totalSkipped++;
    continue;
  }

  const newBody = fixG1Body(article.body);
  const needsBodyFix = newBody !== article.body;

  // Extrair caption se não existir
  const rawText = article.body.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  const newCaption = article.image_caption ? null : extractG1ImageCaption(rawText);
  const needsCaptionFix = newCaption !== null;

  if (!needsBodyFix && !needsCaptionFix) {
    console.log(`[${shortId}] ${shortUrl} — sem mudanças`);
    totalSkipped++;
    continue;
  }

  const changes: string[] = [];
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
  `Concluído: ${totalUpdated} corrigidos, ${totalSkipped} sem mudança, ${totalFailed} erros.`,
);
if (dryRun) console.log("(dry-run — nada foi salvo)");
