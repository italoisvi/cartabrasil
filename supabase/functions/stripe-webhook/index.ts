// ── EDGE FUNCTION: STRIPE WEBHOOK ────────────────────────────────
// Recebe eventos do Stripe e atualiza o plano do assinante.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY")!;
  const body = await req.text();

  // Parse o evento do Stripe (sem verificação de assinatura por enquanto)
  let event;
  try {
    event = JSON.parse(body);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  // Processa checkout.session.completed e invoice.paid (Payment Links enviam invoice.paid)
  const processableEvents = ["checkout.session.completed", "invoice.paid"];
  if (!processableEvents.includes(event.type)) {
    return new Response(JSON.stringify({ received: true }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  const obj = event.data.object;
  const customerEmail = event.type === "invoice.paid"
    ? obj.customer_email
    : (obj.customer_details?.email || obj.customer_email);

  if (!customerEmail) {
    console.error("No customer email found in session");
    return new Response(JSON.stringify({ error: "No email" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Atualiza o plano do assinante no Supabase
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = createClient(supabaseUrl, supabaseServiceKey);

  // Upsert: se já existe como assinante da newsletter, atualiza; senão, cria
  const { error } = await sb.from("subscribers").upsert(
    {
      email: customerEmail,
      plan: "premium",
      active: true,
    },
    { onConflict: "email" },
  );

  if (error) {
    console.error("Error updating subscriber:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  console.log(`Subscriber ${customerEmail} upgraded to premium`);

  return new Response(JSON.stringify({ received: true, email: customerEmail }), {
    headers: { "Content-Type": "application/json" },
  });
});
