// ── ADAPTADOR: EMAIL TEMPLATE BUILDER ───────────────────────────
// Constrói o HTML dos emails. Funções puras.

import type { NewsItem } from "../domain/ports.ts";

const categoryColors: Record<string, string> = {
  politica: "#c0392b",
  mercados: "#2c3e50",
  economia: "#2c3e50",
  internacional: "#d4a017",
  tecnologia: "#2980b9",
  geral: "#7f8c8d",
  "direitos-humanos": "#8e44ad",
  educacao: "#27ae60",
  esportes: "#e67e22",
  justica: "#2c3e50",
  saude: "#16a085",
  analise: "#c0392b",
};

const categoryLabels: Record<string, string> = {
  politica: "POLÍTICA",
  mercados: "ECONOMIA",
  economia: "ECONOMIA",
  internacional: "MUNDO",
  tecnologia: "TECNOLOGIA",
  geral: "GERAL",
  "direitos-humanos": "DIREITOS HUMANOS",
  educacao: "EDUCAÇÃO",
  esportes: "ESPORTES",
  justica: "JUSTIÇA",
  saude: "SAÚDE",
  analise: "ANÁLISE",
};

export function buildNewsletterHtml(
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
  <title>Carta Brasil</title>
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
                  <td style="font-family: Georgia, 'Times New Roman', serif; font-size: 18px; font-weight: 400; color: #111111; letter-spacing: 0.03em;">
                    Carta<strong>Brasil</strong>
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
              <a href="${baseUrl}/noticias.html" style="display: inline-block; background: #111111; color: #ffffff; padding: 14px 28px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 12px; font-weight: 500; letter-spacing: 0.1em; text-transform: uppercase; text-decoration: none;">
                Ver todas as notícias
              </a>
            </td>
          </tr>
          <tr>
            <td style="padding: 20px 32px; border-top: 1px solid #e0e0e0; text-align: center;">
              <p style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 11px; color: #999999; margin: 0 0 6px;">
                &copy; 2026 Carta<strong>Brasil</strong> &middot; Todos os direitos reservados
              </p>
              <p style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 11px; margin: 0;">
                <a href="${unsubscribeUrl}" style="color: #999999; text-decoration: underline;">Alterar preferências</a>
                &nbsp;&middot;&nbsp;
                <a href="${baseUrl}/descadastrar?email=${encodeURIComponent(email)}" style="color: #999999; text-decoration: underline;">Descadastrar</a>
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

/**
 * Constrói o HTML do email de boas-vindas ao novo assinante.
 */
export function buildWelcomeHtml(
  email: string,
  categories: string[],
  frequency: string,
  baseUrl: string,
): string {
  const frequencyLabels: Record<string, string> = {
    realtime: "Tempo real",
    daily: "Diário",
    weekly: "Semanal",
  };

  const catTags = categories
    .map((cat) => {
      const color = categoryColors[cat] || "#999";
      const label = categoryLabels[cat] || cat.toUpperCase();
      return `<span style="display: inline-block; padding: 4px 10px; margin: 3px 4px; font-size: 11px; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; color: ${color}; border: 1px solid ${color}; border-radius: 2px;">${label}</span>`;
    })
    .join("");

  const freqLabel = frequencyLabels[frequency] || frequency;
  const prefsUrl = `${baseUrl}/preferencias.html?email=${encodeURIComponent(email)}`;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Bem-vindo à Carta Brasil</title>
</head>
<body style="margin: 0; padding: 0; background-color: #fafaf8; -webkit-font-smoothing: antialiased;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background-color: #fafaf8;">
    <tr>
      <td align="center" style="padding: 32px 16px;">
        <table width="600" cellpadding="0" cellspacing="0" role="presentation" style="max-width: 600px; width: 100%; background-color: #ffffff; border: 1px solid #e0e0e0;">

          <!-- Header -->
          <tr>
            <td style="padding: 24px 32px; border-bottom: 1px solid #e0e0e0;">
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                  <td style="font-family: Georgia, 'Times New Roman', serif; font-size: 18px; font-weight: 400; color: #111111; letter-spacing: 0.03em;">
                    Carta<strong>Brasil</strong>
                  </td>
                  <td align="right" style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 10px; color: #999999; letter-spacing: 0.1em; text-transform: uppercase;">
                    Bem-vindo
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Conteúdo -->
          <tr>
            <td style="padding: 40px 32px 20px;">
              <h1 style="font-family: Georgia, 'Times New Roman', serif; font-size: 24px; font-weight: 400; color: #111111; margin: 0 0 16px; line-height: 1.3;">
                Sua assinatura está confirmada.
              </h1>
              <p style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 15px; color: #555555; line-height: 1.7; margin: 0 0 24px;">
                A partir de agora, você receberá as notícias mais importantes do Brasil direto no seu e-mail — com fontes verificadas, sem ruído.
              </p>
            </td>
          </tr>

          <!-- Suas preferências -->
          <tr>
            <td style="padding: 0 32px 12px;">
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                  <td style="height: 1px; background: #e0e0e0;"></td>
                  <td width="1%" style="padding: 0 12px; white-space: nowrap; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 9px; letter-spacing: 0.18em; text-transform: uppercase; color: #999999;">
                    Suas preferências
                  </td>
                  <td style="height: 1px; background: #e0e0e0;"></td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 32px 8px;">
              <p style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 12px; color: #999999; margin: 0 0 8px; letter-spacing: 0.06em; text-transform: uppercase;">
                Temas
              </p>
              <div style="margin: 0 0 16px;">
                ${catTags}
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 32px 32px;">
              <p style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 12px; color: #999999; margin: 0 0 6px; letter-spacing: 0.06em; text-transform: uppercase;">
                Frequência
              </p>
              <p style="font-family: Georgia, 'Times New Roman', serif; font-size: 16px; color: #111111; margin: 0;">
                ${freqLabel}
              </p>
            </td>
          </tr>

          <!-- CTA -->
          <tr>
            <td align="center" style="padding: 0 32px 32px;">
              <a href="${baseUrl}" style="display: inline-block; background: #111111; color: #ffffff; padding: 14px 28px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 12px; font-weight: 500; letter-spacing: 0.1em; text-transform: uppercase; text-decoration: none;">
                Acessar o portal
              </a>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 20px 32px; border-top: 1px solid #e0e0e0; text-align: center;">
              <p style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 11px; color: #999999; margin: 0 0 6px;">
                &copy; 2026 Carta<strong>Brasil</strong> &middot; Todos os direitos reservados
              </p>
              <p style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 11px; margin: 0;">
                <a href="${prefsUrl}" style="color: #999999; text-decoration: underline;">Alterar preferências</a>
                &nbsp;&middot;&nbsp;
                <a href="${baseUrl}/descadastrar?email=${encodeURIComponent(email)}" style="color: #999999; text-decoration: underline;">Descadastrar</a>
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
