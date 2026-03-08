/**
 * Script para corrigir embeds do Instagram em artigos já salvos.
 *
 * O normalizeBody anterior transformava blockquotes do Instagram em texto solto.
 * Este script detecta o padrão residual e converte em link estilizado.
 *
 * Uso:
 *   deno run --allow-net --allow-env scripts/fix-instagram-embeds.ts
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

// Padrão: blockquote contendo link para instagram.com (já sanitizado, sem class)
const instagramBlockquoteRegex =
  /<blockquote>[\s\S]*?<a href="(https?:\/\/(?:www\.)?instagram\.com\/[^"]+)"[^>]*>[\s\S]*?<\/blockquote>/gi;

// Padrão alternativo: texto solto de embed sem blockquote (caso o blockquote tenha sido unwrapped)
const instagramLooseRegex =
  /<p><a href="(https?:\/\/(?:www\.)?instagram\.com\/[^"]+)"[^>]*>Ver essa foto no Instagram<\/a><\/p>(?:\s*<p>Um post compartilhado por[\s\S]*?<\/p>)?/gi;

function fixInstagramInBody(body: string): string {
  let fixed = body;

  // Corrigir blockquotes com embed do Instagram
  fixed = fixed.replace(instagramBlockquoteRegex, (_match, url: string) => {
    return `<p><a href="${url}">Ver publicação no Instagram</a></p>`;
  });

  // Corrigir texto solto de embed (sem blockquote)
  fixed = fixed.replace(instagramLooseRegex, (_match, url: string) => {
    return `<p><a href="${url}">Ver publicação no Instagram</a></p>`;
  });

  return fixed;
}

// ── Buscar artigos que contenham links do Instagram no body ──────

let query = sb
  .from("articles")
  .select("id, original_url, body")
  .like("body", "%instagram.com%")
  .order("published_at", { ascending: false });

if (limit > 0) query = query.limit(limit);

const { data: articles, error } = await query;

if (error) {
  console.error("Erro ao buscar artigos:", error.message);
  Deno.exit(1);
}

console.log(`Encontrados ${articles.length} artigos com links do Instagram.\n`);

let totalUpdated = 0;
let totalSkipped = 0;
let totalFailed = 0;

for (const article of articles) {
  if (!article.body) {
    totalSkipped++;
    continue;
  }

  const shortId = article.id.slice(0, 8);
  const shortUrl = (article.original_url || "").replace(
    "https://agenciabrasil.ebc.com.br",
    "",
  );

  const newBody = fixInstagramInBody(article.body);

  if (newBody === article.body) {
    console.log(`[${shortId}] ${shortUrl} — sem mudanças`);
    totalSkipped++;
    continue;
  }

  console.log(`[${shortId}] ${shortUrl} — corrigido`);

  if (dryRun) {
    // Mostrar trecho antes/depois
    const oldSnippet = article.body.match(/instagram\.com[^<]*/i)?.[0] || "";
    const newSnippet = newBody.match(/instagram\.com[^<]*/i)?.[0] || "";
    console.log(`  antes: ...${oldSnippet}...`);
    console.log(`  depois: ...${newSnippet}...`);
  }

  if (!dryRun) {
    const { error: updateError } = await sb
      .from("articles")
      .update({ body: newBody })
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
