// ── EDGE FUNCTION: FETCH RSS ────────────────────────────────────
// Handler fino: autenticação → instancia dependências → chama Use Case.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { CollectArticlesUseCase } from "../_shared/usecases/collect-articles.ts";
import type { FeedConfig } from "../_shared/usecases/collect-articles.ts";
import { HttpRSSFetcher } from "../_shared/infra/rss-fetcher.ts";
import { SupabaseArticleRepo } from "../_shared/infra/supabase-article-repo.ts";
import { SupabaseImageStorage } from "../_shared/infra/supabase-image-storage.ts";

const FEEDS: FeedConfig[] = [
  // ── Agência Brasil (categoria fixa por feed) ──
  { url: "https://agenciabrasil.ebc.com.br/rss/politica/feed.xml", category: "politica", sourceName: "Agência Brasil" },
  { url: "https://agenciabrasil.ebc.com.br/rss/economia/feed.xml", category: "mercados", sourceName: "Agência Brasil" },
  { url: "https://agenciabrasil.ebc.com.br/rss/internacional/feed.xml", category: "internacional", sourceName: "Agência Brasil" },
  { url: "https://agenciabrasil.ebc.com.br/rss/geral/feed.xml", category: "geral", sourceName: "Agência Brasil" },
  { url: "https://agenciabrasil.ebc.com.br/rss/direitos-humanos/feed.xml", category: "direitos-humanos", sourceName: "Agência Brasil" },
  { url: "https://agenciabrasil.ebc.com.br/rss/educacao/feed.xml", category: "educacao", sourceName: "Agência Brasil" },
  { url: "https://agenciabrasil.ebc.com.br/rss/esportes/feed.xml", category: "esportes", sourceName: "Agência Brasil" },
  { url: "https://agenciabrasil.ebc.com.br/rss/justica/feed.xml", category: "justica", sourceName: "Agência Brasil" },
  { url: "https://agenciabrasil.ebc.com.br/rss/saude/feed.xml", category: "saude", sourceName: "Agência Brasil" },
  // ── Agência Senado ──
  { url: "https://www12.senado.leg.br/noticias/rss", category: "politica", sourceName: "Agência Senado" },
];

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

  for (const feed of FEEDS) {
    const label = `${feed.sourceName}/${feed.category || "auto"}`;
    try {
      const count = await useCase.execute(feed);
      results[label] = count;
      console.log(`${label}: ${count} novos artigos`);
    } catch (err) {
      console.error(`Erro no feed ${label}:`, err);
      results[label] = -1;
    }
  }

  return new Response(JSON.stringify({ ok: true, inserted: results }), {
    headers: { "Content-Type": "application/json" },
  });
});
