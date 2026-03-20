// ── EDGE FUNCTION: REWRITE ARTICLE ──────────────────────────────
// Recebe uma URL de notícia, extrai o conteúdo e usa OpenAI para
// reescrever com linguagem original (evitar problemas de direitos autorais).

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Extrai texto legível de HTML bruto (remove tags, scripts, styles)
function extractTextFromHtml(html: string): string {
  // Remover scripts, styles, nav, footer, header
  let clean = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[\s\S]*?<\/nav>/gi, "")
    .replace(/<footer[\s\S]*?<\/footer>/gi, "")
    .replace(/<header[\s\S]*?<\/header>/gi, "")
    .replace(/<aside[\s\S]*?<\/aside>/gi, "");

  // Tentar extrair do <article> ou <main> se existir
  const articleMatch = clean.match(/<article[\s\S]*?>([\s\S]*?)<\/article>/i);
  const mainMatch = clean.match(/<main[\s\S]*?>([\s\S]*?)<\/main>/i);
  if (articleMatch) clean = articleMatch[1];
  else if (mainMatch) clean = mainMatch[1];

  // Converter <p>, <h1-h6>, <br>, <li> em quebras de linha
  clean = clean
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/h[1-6]>/gi, "\n\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return clean;
}

// Extrai o título da página via <title> ou <h1>
function extractTitle(html: string): string {
  const ogTitle = html.match(/<meta[^>]*property="og:title"[^>]*content="([^"]+)"/i);
  if (ogTitle) return ogTitle[1];
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1) return h1[1].replace(/<[^>]+>/g, "").trim();
  const title = html.match(/<title>([\s\S]*?)<\/title>/i);
  if (title) return title[1].trim();
  return "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const { url } = await req.json();

  if (!url) {
    return jsonResponse({ error: "URL obrigatória" }, 400);
  }

  const openaiKey = Deno.env.get("OPENAI_API_KEY");
  if (!openaiKey) {
    return jsonResponse({ error: "OPENAI_API_KEY não configurada no servidor" }, 500);
  }

  // 1. Buscar conteúdo da página
  let html: string;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; CartaBrasil/1.0)",
        "Accept": "text/html",
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    html = await res.text();
  } catch (e) {
    return jsonResponse({ error: `Erro ao acessar a URL: ${e.message}` }, 400);
  }

  const originalTitle = extractTitle(html);
  const articleText = extractTextFromHtml(html);

  if (articleText.length < 100) {
    return jsonResponse({ error: "Não foi possível extrair conteúdo suficiente da página" }, 400);
  }

  // Limitar texto para não estourar tokens (aprox 8000 chars)
  const truncatedText = articleText.slice(0, 8000);

  // 2. Chamar OpenAI para reescrever
  const systemPrompt = `Você é um jornalista editorial do CartaBrasil, um portal de notícias brasileiro.
Sua tarefa é reescrever notícias com linguagem completamente original para evitar qualquer problema de direitos autorais.

Regras:
- Reescreva o título, a descrição e o corpo da notícia com suas próprias palavras
- Mantenha TODOS os fatos, dados, nomes, datas e citações originais
- Use tom jornalístico sério e profissional, na terceira pessoa
- O corpo deve ser formatado em HTML com tags <p>, <h2> (para subtítulos), <blockquote> (para citações)
- Use <strong> para negritar nomes próprios, valores e dados relevantes
- NÃO invente informações que não estejam no texto original
- A descrição deve ter 1-2 frases curtas (máx 200 caracteres)
- Sugira uma categoria entre: politica, economia, internacional, tecnologia, geral, direitos-humanos, educacao, esportes, justica, saude

Responda APENAS com JSON válido neste formato:
{
  "title": "Título reescrito",
  "description": "Descrição curta reescrita",
  "body": "<p>Corpo reescrito em HTML...</p>",
  "category": "categoria-sugerida"
}`;

  const userPrompt = `Reescreva esta notícia com linguagem completamente original:

TÍTULO ORIGINAL: ${originalTitle}

CONTEÚDO:
${truncatedText}`;

  try {
    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 4000,
      }),
    });

    if (!openaiRes.ok) {
      const err = await openaiRes.text();
      return jsonResponse({ error: `Erro na OpenAI: ${err}` }, 502);
    }

    const openaiData = await openaiRes.json();
    const content = openaiData.choices?.[0]?.message?.content;

    if (!content) {
      return jsonResponse({ error: "Resposta vazia da OpenAI" }, 502);
    }

    // Extrair JSON da resposta (pode vir com ```json ... ```)
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return jsonResponse({ error: "Resposta da OpenAI não contém JSON válido" }, 502);
    }

    const rewritten = JSON.parse(jsonMatch[0]);

    return jsonResponse({
      title: rewritten.title || "",
      description: rewritten.description || "",
      body: rewritten.body || "",
      category: rewritten.category || "geral",
      originalUrl: url,
    });
  } catch (e) {
    return jsonResponse({ error: `Erro ao processar com IA: ${e.message}` }, 500);
  }
});
