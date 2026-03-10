// ── EDGE FUNCTION: VERIFY SESSION ────────────────────────────────
// Verifica uma sessão do Stripe Checkout e retorna o email do cliente.

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

  const { session_id } = await req.json();

  if (!session_id) {
    return new Response(
      JSON.stringify({ error: "session_id obrigatório" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY")!;

  // Busca a sessão no Stripe
  const stripeRes = await fetch(
    `https://api.stripe.com/v1/checkout/sessions/${session_id}`,
    {
      headers: {
        Authorization: `Bearer ${stripeKey}`,
      },
    },
  );

  if (!stripeRes.ok) {
    return new Response(
      JSON.stringify({ error: "Sessão não encontrada" }),
      { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const session = await stripeRes.json();

  if (session.payment_status !== "paid") {
    return new Response(
      JSON.stringify({ error: "Pagamento não confirmado" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const email = session.customer_details?.email || session.customer_email;

  return new Response(
    JSON.stringify({ ok: true, email, plan: "premium" }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
