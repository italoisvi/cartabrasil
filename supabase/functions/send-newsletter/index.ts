import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const SITE_URL = Deno.env.get("SITE_URL") || "https://cartadenoticia.com.br";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ── EMAIL TEMPLATE ──────────────────────────────────────────────

interface NewsItem {
  id: string;
  category: string;
  title: string;
  time: string;
}

const categoryColors: Record<string, string> = {
  politica: "#c0392b",
  mercados: "#2c3e50",
  internacional: "#d4a017",
  tecnologia: "#2980b9",
  geral: "#7f8c8d",
};

const categoryLabels: Record<string, string> = {
  politica: "POLÍTICA",
  mercados: "MERCADOS",
  internacional: "INTERNACIONAL",
  tecnologia: "TECNOLOGIA",
  geral: "GERAL",
};

function buildEmail(
  items: NewsItem[],
  baseUrl: string,
  email: string,
): string {
  const today = new Date();
  const dateStr = today.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const formattedDate = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);

  const newsRows = items
    .map((item) => {
      const color = categoryColors[item.category] || "#999";
      const label =
        categoryLabels[item.category] || item.category.toUpperCase();
      const articleUrl = `${baseUrl}/noticia.html?id=${item.id}`;

      return `
      <tr>
        <td style="padding: 24px 0; border-bottom: 1px solid #e0e0e0;">
          <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
            <tr>
              <td style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 11px; font-weight: 600; letter-spacing: 0.12em; color: ${color}; text-transform: uppercase;">
                ${label}
              </td>
              <td align="right" style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 12px; color: #999999;">
                ${item.time}
              </td>
            </tr>
          </table>
          <a href="${articleUrl}" style="text-decoration: none; color: #111111;">
            <p style="font-family: Georgia, 'Times New Roman', serif; font-size: 20px; font-weight: 400; line-height: 1.35; color: #111111; margin: 8px 0 0 0;">
              ${item.title}
            </p>
          </a>
        </td>
      </tr>`;
    })
    .join("");

  const unsubscribeUrl = `${baseUrl}/preferencias.html?email=${encodeURIComponent(email)}`;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Carta de Notícia</title>
</head>
<body style="margin: 0; padding: 0; background-color: #fafaf8; -webkit-font-smoothing: antialiased;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background-color: #fafaf8;">
    <tr>
      <td align="center" style="padding: 32px 16px;">
        <table width="600" cellpadding="0" cellspacing="0" role="presentation" style="max-width: 600px; width: 100%; background-color: #ffffff; border: 1px solid #e0e0e0;">
          <tr>
            <td style="padding: 24px 32px; border-bottom: 1px solid #e0e0e0;">
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                  <td style="font-family: Georgia, 'Times New Roman', serif; font-size: 18px; font-weight: 700; color: #111111; letter-spacing: 0.03em;">
                    Carta de Notícia<span style="color: #c0392b; margin-left: -3px;">.</span>
                  </td>
                  <td align="right" style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 10px; color: #999999; letter-spacing: 0.1em; text-transform: uppercase;">
                    Breaking news
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding: 20px 32px 4px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 11px; color: #999999; letter-spacing: 0.1em; text-transform: uppercase;">
              ${formattedDate}
            </td>
          </tr>
          <tr>
            <td style="padding: 8px 32px 0;">
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                  <td style="height: 1px; background: #e0e0e0;"></td>
                  <td width="1%" style="padding: 0 12px; white-space: nowrap; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 9px; letter-spacing: 0.18em; text-transform: uppercase; color: #999999;">
                    Suas notícias de hoje
                  </td>
                  <td style="height: 1px; background: #e0e0e0;"></td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 32px;">
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                ${newsRows}
              </table>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding: 32px;">
              <a href="${baseUrl}" style="display: inline-block; background: #111111; color: #ffffff; padding: 14px 28px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 12px; font-weight: 500; letter-spacing: 0.1em; text-transform: uppercase; text-decoration: none;">
                Ver todas as notícias
              </a>
            </td>
          </tr>
          <tr>
            <td style="padding: 20px 32px; border-top: 1px solid #e0e0e0; text-align: center;">
              <p style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 11px; color: #999999; margin: 0 0 6px;">
                &copy; 2026 Carta de Notícia &middot; Todos os direitos reservados
              </p>
              <p style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 11px; margin: 0;">
                <a href="${unsubscribeUrl}" style="color: #999999; text-decoration: underline;">Alterar preferências</a>
                &nbsp;&middot;&nbsp;
                <a href="${baseUrl}" style="color: #999999; text-decoration: underline;">Descadastrar</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ── HELPERS ──────────────────────────────────────────────────────

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  const h = d.getHours().toString().padStart(2, "0");
  const m = d.getMinutes().toString().padStart(2, "0");
  return `${h}h${m}`;
}

async function sendEmail(
  to: string,
  subject: string,
  html: string,
): Promise<boolean> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Carta de Notícia <onboarding@resend.dev>",
      to: [to],
      subject,
      html,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error(`Erro ao enviar para ${to}:`, err);
    return false;
  }

  return true;
}

// ── HANDLER ─────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const authHeader = req.headers.get("Authorization");
  const expectedToken = Deno.env.get("CRON_SECRET");
  if (expectedToken && authHeader !== `Bearer ${expectedToken}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const url = new URL(req.url);
  const frequency = url.searchParams.get("frequency") || "realtime";

  const { data: subscribers, error: subError } = await supabase
    .from("subscribers")
    .select("email, categories")
    .eq("active", true)
    .eq("frequency", frequency);

  if (subError || !subscribers?.length) {
    return new Response(
      JSON.stringify({
        ok: true,
        sent: 0,
        reason: subError?.message || "Nenhum assinante encontrado",
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  }

  const now = new Date();
  let since: Date;
  if (frequency === "realtime") {
    since = new Date(now.getTime() - 15 * 60 * 1000);
  } else if (frequency === "daily") {
    since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  } else {
    since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  }

  const { data: articles, error: artError } = await supabase
    .from("articles")
    .select("id, title, category, published_at")
    .gte("published_at", since.toISOString())
    .order("published_at", { ascending: false })
    .limit(20);

  if (artError || !articles?.length) {
    return new Response(
      JSON.stringify({
        ok: true,
        sent: 0,
        reason: "Nenhum artigo novo no período",
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  }

  let sent = 0;
  let failed = 0;

  for (const sub of subscribers) {
    const filtered = articles.filter((a) =>
      sub.categories.includes(a.category),
    );

    if (filtered.length === 0) continue;

    const newsItems = filtered.map((a) => ({
      id: a.id,
      category: a.category,
      title: a.title,
      time: formatTime(a.published_at),
    }));

    const html = buildEmail(newsItems, SITE_URL, sub.email);

    const subject =
      frequency === "realtime"
        ? `${newsItems[0].title}`
        : frequency === "daily"
          ? `Carta de Notícia — Resumo do dia`
          : `Carta de Notícia — Resumo da semana`;

    const ok = await sendEmail(sub.email, subject, html);
    if (ok) sent++;
    else failed++;
  }

  return new Response(
    JSON.stringify({ ok: true, sent, failed, articlesCount: articles.length }),
    { headers: { "Content-Type": "application/json" } },
  );
});
