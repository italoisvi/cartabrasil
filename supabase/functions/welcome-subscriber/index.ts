// ── EDGE FUNCTION: WELCOME SUBSCRIBER ───────────────────────────
// Envia email de boas-vindas ao novo assinante.

import { ResendEmailSender } from "../_shared/infra/resend-email-sender.ts";
import { buildWelcomeHtml } from "../_shared/infra/email-template.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  const { email, categories, frequency } = await req.json();

  if (!email) {
    return new Response(
      JSON.stringify({ ok: false, error: "Email obrigatório" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const siteUrl = Deno.env.get("SITE_URL") || "https://cartabrasil.com.br";
  const emailSender = new ResendEmailSender(Deno.env.get("RESEND_API_KEY")!);

  const html = buildWelcomeHtml(email, categories || [], frequency || "daily", siteUrl);
  const ok = await emailSender.send(email, "Bem-vindo à Carta Brasil!", html);

  return new Response(
    JSON.stringify({ ok }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
