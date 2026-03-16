// ── EDGE FUNCTION: PUBLISH INSTAGRAM ─────────────────────────────
// Publica a imagem de capa de um artigo no Instagram via Content Publishing API.
// Fluxo: criar container → aguardar processamento → publicar.

const IG_USER_ID = "34230918846555179";
const IG_API_VERSION = "v25.0";
const IG_API_BASE = `https://graph.instagram.com/${IG_API_VERSION}`;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  try {
    const { image_url, caption } = await req.json();

    if (!image_url) {
      return new Response(
        JSON.stringify({ error: "image_url é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const accessToken = Deno.env.get("INSTAGRAM_ACCESS_TOKEN");
    if (!accessToken) {
      return new Response(
        JSON.stringify({ error: "INSTAGRAM_ACCESS_TOKEN não configurado" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Passo 1: Criar container de mídia ──
    const createRes = await fetch(`${IG_API_BASE}/${IG_USER_ID}/media`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        image_url,
        caption: caption || "",
        access_token: accessToken,
      }),
    });

    const createData = await createRes.json();

    if (createData.error) {
      return new Response(
        JSON.stringify({ error: "Erro ao criar container", details: createData.error }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const containerId = createData.id;

    // ── Passo 2: Aguardar processamento (polling) ──
    let status = "IN_PROGRESS";
    let attempts = 0;
    const maxAttempts = 10;

    while (status === "IN_PROGRESS" && attempts < maxAttempts) {
      await new Promise((r) => setTimeout(r, 3000)); // esperar 3s
      attempts++;

      const statusRes = await fetch(
        `${IG_API_BASE}/${containerId}?fields=status_code&access_token=${accessToken}`
      );
      const statusData = await statusRes.json();
      status = statusData.status_code || "ERROR";
    }

    if (status !== "FINISHED") {
      return new Response(
        JSON.stringify({ error: "Container não ficou pronto", status }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Passo 3: Publicar ──
    const publishRes = await fetch(`${IG_API_BASE}/${IG_USER_ID}/media_publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        creation_id: containerId,
        access_token: accessToken,
      }),
    });

    const publishData = await publishRes.json();

    if (publishData.error) {
      return new Response(
        JSON.stringify({ error: "Erro ao publicar", details: publishData.error }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, ig_media_id: publishData.id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Erro interno", message: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
