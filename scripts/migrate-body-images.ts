/**
 * Script de migração: faz upload das imagens do corpo dos artigos existentes
 * para o Supabase Storage e atualiza o body HTML com as novas URLs.
 *
 * Uso:
 *   deno run --allow-net --allow-env scripts/migrate-body-images.ts
 *
 * Variáveis de ambiente necessárias:
 *   SUPABASE_URL       — URL do projeto Supabase
 *   SUPABASE_KEY       — Service Role Key (não a anon key, precisa de escrita no Storage)
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_KEY = Deno.env.get("SUPABASE_KEY");

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Defina SUPABASE_URL e SUPABASE_KEY (service role key)");
  Deno.exit(1);
}

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── Buscar artigos com imagens externas no body ──────────────────

const { data: articles, error } = await sb
  .from("articles")
  .select("id, body")
  .not("body", "is", null)
  .like("body", "%<img%")
  .order("published_at", { ascending: false });

if (error) {
  console.error("Erro ao buscar artigos:", error.message);
  Deno.exit(1);
}

console.log(`Encontrados ${articles.length} artigos com imagens no body.\n`);

let totalMigrated = 0;
let totalImages = 0;

for (const article of articles) {
  const imgRegex = /<img\s[^>]*src="([^"]+)"[^>]*>/gi;
  const matches = [...article.body.matchAll(imgRegex)];

  // Filtrar: URLs externas absolutas, sem placeholders
  const externalMatches = matches.filter(
    (m) => m[1].startsWith("http") && !m[1].includes("supabase.co") && !m[1].includes("loading_v2.gif"),
  );

  // Limpar placeholders de lazy-loading do body
  const placeholderRegex = /<img[^>]*src="[^"]*loading_v2\.gif"[^>]*\/?>/gi;
  if (placeholderRegex.test(article.body)) {
    const cleanedBody = article.body.replace(placeholderRegex, "");
    await sb.from("articles").update({ body: cleanedBody }).eq("id", article.id);
    article.body = cleanedBody;
    console.log(`[${article.id}] Placeholders loading_v2.gif removidos`);
  }

  if (externalMatches.length === 0) continue;

  console.log(`[${article.id}] ${externalMatches.length} imagem(ns) externa(s)`);

  let updatedBody = article.body;
  let migrated = 0;

  for (let i = 0; i < externalMatches.length; i++) {
    const originalUrl = externalMatches[i][1];

    try {
      const response = await fetch(originalUrl);
      if (!response.ok) {
        console.log(`  ✗ HTTP ${response.status}: ${originalUrl.slice(0, 80)}...`);
        continue;
      }

      const blob = await response.blob();
      const ext = originalUrl.includes(".png") ? "png" : "jpg";
      const path = `${article.id}_body_${i}.${ext}`;

      const { error: uploadError } = await sb.storage
        .from("article-images")
        .upload(path, blob, {
          contentType: blob.type || `image/${ext}`,
          upsert: true,
        });

      if (uploadError) {
        console.log(`  ✗ Upload falhou: ${uploadError.message}`);
        continue;
      }

      const {
        data: { publicUrl },
      } = sb.storage.from("article-images").getPublicUrl(path);

      updatedBody = updatedBody.replaceAll(originalUrl, publicUrl);
      migrated++;
      console.log(`  ✓ ${path}`);
    } catch (err) {
      console.log(`  ✗ Erro: ${(err as Error).message}`);
    }
  }

  if (migrated > 0) {
    const { error: updateError } = await sb
      .from("articles")
      .update({ body: updatedBody })
      .eq("id", article.id);

    if (updateError) {
      console.log(`  ✗ Update falhou: ${updateError.message}`);
    } else {
      totalMigrated++;
      totalImages += migrated;
      console.log(`  → Body atualizado (${migrated} imagens)\n`);
    }
  }
}

console.log("─".repeat(50));
console.log(`Concluído: ${totalImages} imagens migradas em ${totalMigrated} artigos.`);
