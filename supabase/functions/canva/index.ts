// ── EDGE FUNCTION: CANVA ──────────────────────────────────────────
// Integração com Canva Connect API para criar Stories do Instagram.
// Endpoints: /canva?action=auth|callback|create|export|status|publish-story

const CANVA_CLIENT_ID = Deno.env.get("CANVA_CLIENT_ID") || "";
const CANVA_CLIENT_SECRET = Deno.env.get("CANVA_CLIENT_SECRET") || "";
const CANVA_API = "https://api.canva.com/rest/v1";
const CANVA_AUTH_URL = "https://www.canva.com/api/oauth/authorize";
const CANVA_TOKEN_URL = "https://api.canva.com/rest/v1/oauth/token";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";

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

// ── Store tokens in memory (para simplificar — em produção usar DB) ──
const tokenStore: Record<string, {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}> = {};

const pkceStore: Record<string, string> = {};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const action = url.searchParams.get("action");

  try {
    // ════════════ AUTH: Gerar URL de autorização ════════════
    if (action === "auth") {
      const { verifier, challenge } = await generatePKCE();
      const state = crypto.randomUUID();
      pkceStore[state] = verifier;

      const redirectUri = `${SUPABASE_URL}/functions/v1/canva?action=callback`;
      const scopes = "asset:write design:content:write design:content:read design:meta:read";

      const authUrl =
        `${CANVA_AUTH_URL}?` +
        `code_challenge=${challenge}&` +
        `code_challenge_method=S256&` +
        `scope=${encodeURIComponent(scopes)}&` +
        `response_type=code&` +
        `client_id=${CANVA_CLIENT_ID}&` +
        `redirect_uri=${encodeURIComponent(redirectUri)}&` +
        `state=${state}`;

      return jsonRes({ auth_url: authUrl, state });
    }

    // ════════════ CALLBACK: Trocar code por token ════════════
    if (action === "callback") {
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");

      if (!code || !state) {
        return new Response("Código ou state ausente", { status: 400, headers: corsHeaders });
      }

      const verifier = pkceStore[state];
      if (!verifier) {
        return new Response("State inválido", { status: 400, headers: corsHeaders });
      }
      delete pkceStore[state];

      const redirectUri = `${SUPABASE_URL}/functions/v1/canva?action=callback`;
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
        tokenStore["default"] = {
          access_token: tokenData.access_token,
          refresh_token: tokenData.refresh_token,
          expires_at: Date.now() + tokenData.expires_in * 1000,
        };

        // Redirecionar de volta para o admin com sucesso
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
      const token = tokenStore["default"];
      const connected = !!token && token.expires_at > Date.now();
      return jsonRes({ connected });
    }

    // ── Helper: obter token válido ──
    async function getToken(): Promise<string> {
      const stored = tokenStore["default"];
      if (!stored) throw new Error("Não conectado ao Canva");

      // Refresh se expirado
      if (stored.expires_at < Date.now() + 60000) {
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
          stored.access_token = refreshData.access_token;
          stored.refresh_token = refreshData.refresh_token;
          stored.expires_at = Date.now() + refreshData.expires_in * 1000;
        } else {
          throw new Error("Falha ao renovar token");
        }
      }

      return stored.access_token;
    }

    // ════════════ CREATE: Criar design Story ════════════
    if (action === "create" && req.method === "POST") {
      const token = await getToken();
      const { image_url, title } = await req.json();

      // Passo 1: Upload da imagem como asset
      let assetId: string | undefined;

      if (image_url) {
        // Baixar a imagem
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
        } else if (uploadData.job?.status === "in_progress") {
          // Esperar upload completar
          assetId = uploadData.job?.asset?.id;
          // O asset pode ser usado mesmo em progresso em alguns casos
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
      const token = await getToken();
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
      const token = await getToken();
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
      const token = await getToken();
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

      // Criar container de Stories
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

      // Aguardar container do IG
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

      // Publicar
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
