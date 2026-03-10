// ── EDGE FUNCTION: CHECK SUBSCRIPTION ────────────────────────────
// Verifica o plano de um assinante pelo email.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  const { email } = await req.json();

  if (!email) {
    return new Response(
      JSON.stringify({ error: "E-mail obrigatório" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = createClient(supabaseUrl, supabaseServiceKey);

  const { data, error } = await sb
    .from("subscribers")
    .select("email, plan, active")
    .eq("email", email.toLowerCase().trim())
    .maybeSingle();

  if (error) {
    return new Response(
      JSON.stringify({ error: "Erro ao consultar assinatura" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  if (!data) {
    return new Response(
      JSON.stringify({ error: "E-mail não encontrado. Verifique se digitou corretamente." }),
      { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  return new Response(
    JSON.stringify({ email: data.email, plan: data.plan || "free", active: data.active }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
