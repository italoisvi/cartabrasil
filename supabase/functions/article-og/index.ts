// ── EDGE FUNCTION: ARTICLE OG ───────────────────────────────────
// Serve HTML com Open Graph meta tags para previews em WhatsApp,
// Telegram, Twitter, Facebook etc. Crawlers não executam JS,
// então precisam das tags no HTML estático.
//
// Uso: /functions/v1/article-og?slug=meu-artigo
// Crawlers veem as OG tags → preview rico.
// Usuários são redirecionados para a página real.
//
// DEPLOY: supabase functions deploy article-og --no-verify-jwt

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SITE_URL = Deno.env.get("SITE_URL") || "https://cartabrasil.com.br";
const DEFAULT_IMAGE = `${SITE_URL}/assets/images/CB.png`;

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const slug = url.searchParams.get("slug");
  const id = url.searchParams.get("id");

  if (!slug && !id) {
    return Response.redirect(`${SITE_URL}`, 302);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let query = supabase
    .from("articles")
    .select("id, title, description, image_url, category, published_at, author, slug");

  if (slug) {
    query = query.eq("slug", slug);
  } else {
    query = query.eq("id", id!);
  }

  const { data: article, error } = await query.maybeSingle();

  if (!article) {
    return Response.redirect(`${SITE_URL}`, 302);
  }

  const articleSlug = article.slug || article.id;
  const shareUrl = `${SITE_URL}/share/${articleSlug}`;
  const articleUrl = `${SITE_URL}/noticia?id=${article.id}`;
  const title = article.title || "CartaBrasil";
  const description = article.description || "As principais notícias do Brasil, curadas para você.";
  const image = article.image_url || DEFAULT_IMAGE;
  const author = article.author || "CartaBrasil";

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtml(title)} — CartaBrasil</title>

  <!-- Open Graph -->
  <meta property="fb:app_id" content="1354069589872510" />
  <meta property="og:type" content="article" />
  <meta property="og:site_name" content="CartaBrasil" />
  <meta property="og:title" content="${escapeHtml(title)}" />
  <meta property="og:description" content="${escapeHtml(description)}" />
  <meta property="og:image" content="${escapeHtml(image)}" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:url" content="${escapeHtml(shareUrl)}" />
  <meta property="og:locale" content="pt_BR" />
  ${article.published_at ? `<meta property="article:published_time" content="${article.published_at}" />` : ""}
  ${author ? `<meta property="article:author" content="${escapeHtml(author)}" />` : ""}

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeHtml(title)}" />
  <meta name="twitter:description" content="${escapeHtml(description)}" />
  <meta name="twitter:image" content="${escapeHtml(image)}" />

  <link rel="canonical" href="${escapeHtml(articleUrl)}" />
  <script>window.location.replace("${articleUrl.replace(/"/g, '\\"')}");</script>
</head>
<body>
  <p>Redirecionando para <a href="${escapeHtml(articleUrl)}">${escapeHtml(title)}</a>...</p>
</body>
</html>`;

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
});
