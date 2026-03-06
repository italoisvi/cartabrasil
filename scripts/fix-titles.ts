/**
 * Corrige títulos com HTML entities (&quot; etc.) nos artigos existentes.
 *
 * Uso:
 *   deno run --allow-net --allow-env scripts/fix-titles.ts
 *
 * Variáveis de ambiente:
 *   SUPABASE_URL, SUPABASE_KEY (service role)
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_KEY = Deno.env.get("SUPABASE_KEY");

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Defina SUPABASE_URL e SUPABASE_KEY");
  Deno.exit(1);
}

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

const { data: articles, error } = await sb
  .from("articles")
  .select("id, title")
  .or("title.like.%&quot;%,title.like.%&amp;%,title.like.%&#39;%,title.like.%&lt;%,title.like.%&gt;%");

if (error) {
  console.error("Erro:", error.message);
  Deno.exit(1);
}

console.log(`Encontrados ${articles.length} títulos com HTML entities.\n`);

let updated = 0;
for (const article of articles) {
  const fixed = article.title
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_: string, n: string) => String.fromCharCode(Number(n)));

  if (fixed === article.title) continue;

  console.log(`[${article.id.slice(0, 8)}] "${article.title}" → "${fixed}"`);

  const { error: updateError } = await sb
    .from("articles")
    .update({ title: fixed })
    .eq("id", article.id);

  if (updateError) {
    console.error(`  ERRO: ${updateError.message}`);
  } else {
    updated++;
  }
}

console.log(`\nConcluído: ${updated} títulos corrigidos.`);
