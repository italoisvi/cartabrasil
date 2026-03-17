// ── EDGE FUNCTION: CANVA ──────────────────────────────────────────
// Integração com Canva Connect API para criar Stories do Instagram.
// Tokens persistidos na tabela canva_tokens (Edge Functions são stateless).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CANVA_CLIENT_ID = Deno.env.get("CANVA_CLIENT_ID") || "";
const CANVA_CLIENT_SECRET = Deno.env.get("CANVA_CLIENT_SECRET") || "";
const CANVA_API = "https://api.canva.com/rest/v1";
const CANVA_AUTH_URL = "https://www.canva.com/api/oauth/authorize";
const CANVA_TOKEN_URL = "https://api.canva.com/rest/v1/oauth/token";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function jsonRes(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function sb() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
}

// ── Gerar PKCE ──
async function generatePKCE() {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  const verifier = btoa(String.fromCharCode(...array))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const hash = await crypto.subtle.digest("SHA-256", data);
  const challenge = btoa(String.fromCharCode(...new Uint8Array(hash)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  return { verifier, challenge };
}

// ── Salvar/obter tokens do DB ──
async function saveTokens(accessToken: string, refreshToken: string, expiresIn: number) {
  const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
  const client = sb();
  // Upsert: sempre 1 registro com id='default'
  await client.from("canva_tokens").upsert({
    id: "default",
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_at: expiresAt,
  });
}

async function getStoredTokens() {
  const client = sb();
  const { data } = await client
    .from("canva_tokens")
    .select("*")
    .eq("id", "default")
    .maybeSingle();
  return data;
}

async function getValidToken(): Promise<string> {
  const stored = await getStoredTokens();
  if (!stored) throw new Error("Não conectado ao Canva. Conecte primeiro.");

  const expiresAt = new Date(stored.expires_at).getTime();

  // Refresh se expira em menos de 1 minuto
  if (expiresAt < Date.now() + 60000) {
    const credentials = btoa(`${CANVA_CLIENT_ID}:${CANVA_CLIENT_SECRET}`);
    const refreshRes = await fetch(CANVA_TOKEN_URL, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: stored.refresh_token,
      }),
    });
    const refreshData = await refreshRes.json();
    if (refreshData.access_token) {
      await saveTokens(
        refreshData.access_token,
        refreshData.refresh_token,
        refreshData.expires_in
      );
      return refreshData.access_token;
    }
    throw new Error("Falha ao renovar token do Canva");
  }

  return stored.access_token;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const action = url.searchParams.get("action");
  const callbackCode = url.searchParams.get("code");

  try {
    // ════════════ AUTH: Gerar URL de autorização ════════════
    if (action === "auth") {
      const { verifier, challenge } = await generatePKCE();
      // Codificar verifier no state (Edge Functions são stateless)
      const statePayload = btoa(JSON.stringify({ id: crypto.randomUUID(), v: verifier }));

      const redirectUri = `${SUPABASE_URL}/functions/v1/canva`;
      const scopes = "asset:write design:content:write design:content:read design:meta:read";

      const authUrl =
        `${CANVA_AUTH_URL}?` +
        `code_challenge=${challenge}&` +
        `code_challenge_method=S256&` +
        `scope=${encodeURIComponent(scopes)}&` +
        `response_type=code&` +
        `client_id=${CANVA_CLIENT_ID}&` +
        `redirect_uri=${encodeURIComponent(redirectUri)}&` +
        `state=${encodeURIComponent(statePayload)}`;

      return jsonRes({ auth_url: authUrl });
    }

    // ════════════ CALLBACK: Trocar code por token ════════════
    if (callbackCode) {
      const code = callbackCode;
      const stateParam = url.searchParams.get("state");

      if (!stateParam) {
        return new Response("State ausente", { status: 400, headers: corsHeaders });
      }

      let verifier: string;
      try {
        const decoded = JSON.parse(atob(decodeURIComponent(stateParam)));
        verifier = decoded.v;
      } catch {
        return new Response("State inválido: " + stateParam, { status: 400, headers: corsHeaders });
      }

      const redirectUri = `${SUPABASE_URL}/functions/v1/canva`;
      const credentials = btoa(`${CANVA_CLIENT_ID}:${CANVA_CLIENT_SECRET}`);

      const tokenRes = await fetch(CANVA_TOKEN_URL, {
        method: "POST",
        headers: {
          "Authorization": `Basic ${credentials}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          code_verifier: verifier,
          redirect_uri: redirectUri,
        }),
      });

      const tokenData = await tokenRes.json();

      if (tokenData.access_token) {
        await saveTokens(
          tokenData.access_token,
          tokenData.refresh_token,
          tokenData.expires_in
        );

        return new Response(
          `<html><body><script>
            window.opener && window.opener.postMessage({ canvaAuth: 'success' }, '*');
            window.close();
          </script><p>Conectado ao Canva! Pode fechar esta aba.</p></body></html>`,
          { headers: { ...corsHeaders, "Content-Type": "text/html" } }
        );
      }

      return new Response("Erro ao obter token: " + JSON.stringify(tokenData), {
        status: 400,
        headers: corsHeaders,
      });
    }

    // ════════════ CHECK: Verificar se está conectado ════════════
    if (action === "check") {
      const stored = await getStoredTokens();
      const connected = !!stored && new Date(stored.expires_at).getTime() > Date.now();
      return jsonRes({ connected });
    }

    // ════════════ CREATE: Criar design Story ════════════
    if (action === "create" && req.method === "POST") {
      const token = await getValidToken();
      const { image_url, title } = await req.json();

      // Passo 1: Upload da imagem como asset
      let assetId: string | undefined;

      if (image_url) {
        const imgRes = await fetch(image_url);
        const imgBytes = await imgRes.arrayBuffer();

        const nameBase64 = btoa("cover.jpg");

        const uploadRes = await fetch(`${CANVA_API}/asset-uploads`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/octet-stream",
            "Asset-Upload-Metadata": JSON.stringify({ name_base64: nameBase64 }),
          },
          body: imgBytes,
        });

        const uploadData = await uploadRes.json();

        if (uploadData.job?.status === "success" && uploadData.job?.asset?.id) {
          assetId = uploadData.job.asset.id;
        } else if (uploadData.job?.asset?.id) {
          assetId = uploadData.job.asset.id;
        }
      }

      // Passo 2: Criar design 1080x1920 (Story)
      const designBody: Record<string, unknown> = {
        design_type: { type: "custom", width: 1080, height: 1920 },
        title: title || "Story CartaBrasil",
      };

      if (assetId) {
        designBody.asset_id = assetId;
      }

      const designRes = await fetch(`${CANVA_API}/designs`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(designBody),
      });

      const designData = await designRes.json();

      if (designData.design) {
        return jsonRes({
          success: true,
          design_id: designData.design.id,
          edit_url: designData.design.urls.edit_url,
          title: designData.design.title,
        });
      }

      return jsonRes({ error: "Erro ao criar design", details: designData }, 400);
    }

    // ════════════ EXPORT: Exportar design como PNG ════════════
    if (action === "export" && req.method === "POST") {
      const token = await getValidToken();
      const { design_id } = await req.json();

      const exportRes = await fetch(`${CANVA_API}/exports`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          design_id,
          format: { type: "png", width: 1080, height: 1920, lossless: false },
        }),
      });

      const exportData = await exportRes.json();
      return jsonRes(exportData);
    }

    // ════════════ STATUS: Verificar status do export ════════════
    if (action === "status") {
      const token = await getValidToken();
      const exportId = url.searchParams.get("export_id");

      if (!exportId) return jsonRes({ error: "export_id obrigatório" }, 400);

      const statusRes = await fetch(`${CANVA_API}/exports/${exportId}`, {
        headers: { "Authorization": `Bearer ${token}` },
      });

      const statusData = await statusRes.json();
      return jsonRes(statusData);
    }

    // ════════════ PUBLISH-STORY: Exportar + publicar no Instagram Stories ════════════
    if (action === "publish-story" && req.method === "POST") {
      const token = await getValidToken();
      const { design_id } = await req.json();

      // Passo 1: Exportar design
      const exportRes = await fetch(`${CANVA_API}/exports`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          design_id,
          format: { type: "png", width: 1080, height: 1920, lossless: false },
        }),
      });

      const exportData = await exportRes.json();
      const exportId = exportData.job?.id;

      if (!exportId) {
        return jsonRes({ error: "Falha ao iniciar exportação", details: exportData }, 400);
      }

      // Passo 2: Aguardar exportação (polling)
      let exportStatus = "in_progress";
      let exportUrls: string[] = [];
      let attempts = 0;

      while (exportStatus === "in_progress" && attempts < 15) {
        await new Promise((r) => setTimeout(r, 2000));
        attempts++;

        const checkRes = await fetch(`${CANVA_API}/exports/${exportId}`, {
          headers: { "Authorization": `Bearer ${token}` },
        });
        const checkData = await checkRes.json();
        exportStatus = checkData.job?.status || "failed";
        if (checkData.job?.urls) exportUrls = checkData.job.urls;
      }

      if (exportStatus !== "success" || exportUrls.length === 0) {
        return jsonRes({ error: "Exportação falhou", status: exportStatus }, 500);
      }

      // Passo 3: Publicar no Instagram Stories
      const igToken = Deno.env.get("INSTAGRAM_ACCESS_TOKEN");
      const igUserId = "34230918846555179";
      const igApiBase = "https://graph.instagram.com/v25.0";

      const igCreateRes = await fetch(`${igApiBase}/${igUserId}/media`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image_url: exportUrls[0],
          media_type: "STORIES",
          access_token: igToken,
        }),
      });

      const igCreateData = await igCreateRes.json();

      if (igCreateData.error) {
        return jsonRes({ error: "Erro ao criar Story no IG", details: igCreateData.error }, 400);
      }

      const containerId = igCreateData.id;
      let igStatus = "IN_PROGRESS";
      let igAttempts = 0;

      while (igStatus === "IN_PROGRESS" && igAttempts < 10) {
        await new Promise((r) => setTimeout(r, 3000));
        igAttempts++;

        const igCheckRes = await fetch(
          `${igApiBase}/${containerId}?fields=status_code&access_token=${igToken}`
        );
        const igCheckData = await igCheckRes.json();
        igStatus = igCheckData.status_code || "ERROR";
      }

      if (igStatus !== "FINISHED") {
        return jsonRes({ error: "Container IG não ficou pronto", status: igStatus }, 500);
      }

      const igPublishRes = await fetch(`${igApiBase}/${igUserId}/media_publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          creation_id: containerId,
          access_token: igToken,
        }),
      });

      const igPublishData = await igPublishRes.json();

      if (igPublishData.error) {
        return jsonRes({ error: "Erro ao publicar Story", details: igPublishData.error }, 400);
      }

      return jsonRes({
        success: true,
        ig_media_id: igPublishData.id,
        export_url: exportUrls[0],
      });
    }

    return jsonRes({ error: "action inválida" }, 400);
  } catch (err) {
    return jsonRes({ error: "Erro interno", message: (err as Error).message }, 500);
  }
});
