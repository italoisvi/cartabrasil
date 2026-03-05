// ── EDGE FUNCTION: FETCH RSS ────────────────────────────────────
// Handler fino: autenticação → instancia dependências → chama Use Case.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { CollectArticlesUseCase } from "../_shared/usecases/collect-articles.ts";
import { HttpRSSFetcher } from "../_shared/infra/rss-fetcher.ts";
import { SupabaseArticleRepo } from "../_shared/infra/supabase-article-repo.ts";
import { SupabaseImageStorage } from "../_shared/infra/supabase-image-storage.ts";
import type { Category } from "../_shared/domain/ports.ts";

const FEEDS: Record<string, Category> = {
  "http://agenciabrasil.ebc.com.br/rss/politica/feed.xml": "politica",
  "http://agenciabrasil.ebc.com.br/rss/economia/feed.xml": "mercados",
  "http://agenciabrasil.ebc.com.br/rss/internacional/feed.xml": "internacional",
  "http://agenciabrasil.ebc.com.br/rss/geral/feed.xml": "geral",
  "http://agenciabrasil.ebc.com.br/rss/direitos-humanos/feed.xml": "direitos-humanos",
  "http://agenciabrasil.ebc.com.br/rss/educacao/feed.xml": "educacao",
  "http://agenciabrasil.ebc.com.br/rss/esportes/feed.xml": "esportes",
  "http://agenciabrasil.ebc.com.br/rss/justica/feed.xml": "justica",
  "http://agenciabrasil.ebc.com.br/rss/saude/feed.xml": "saude",
};

Deno.serve(async (req) => {
  const authHeader = req.headers.get("Authorization");
  const expectedToken = Deno.env.get("CRON_SECRET");
  if (expectedToken && authHeader !== `Bearer ${expectedToken}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  // Wiring: instancia adaptadores concretos
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const useCase = new CollectArticlesUseCase({
    rssFetcher: new HttpRSSFetcher(),
    articleRepo: new SupabaseArticleRepo(supabase),
    imageStorage: new SupabaseImageStorage(supabase),
  });

  const results: Record<string, number> = {};

  for (const [feedUrl, category] of Object.entries(FEEDS)) {
    try {
      const count = await useCase.execute(feedUrl, category);
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
