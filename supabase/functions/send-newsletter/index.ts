// ── EDGE FUNCTION: SEND NEWSLETTER ──────────────────────────────
// Handler fino: autenticação → instancia dependências → chama Use Case.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SendNewsletterUseCase } from "../_shared/usecases/send-newsletter.ts";
import { SupabaseArticleRepo } from "../_shared/infra/supabase-article-repo.ts";
import { SupabaseSubscriberRepo } from "../_shared/infra/supabase-subscriber-repo.ts";
import { ResendEmailSender } from "../_shared/infra/resend-email-sender.ts";
import { buildNewsletterHtml } from "../_shared/infra/email-template.ts";
import type { Frequency } from "../_shared/domain/ports.ts";

Deno.serve(async (req) => {
  const authHeader = req.headers.get("Authorization");
  const expectedToken = Deno.env.get("CRON_SECRET");
  if (expectedToken && authHeader !== `Bearer ${expectedToken}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const url = new URL(req.url);
  const frequency = (url.searchParams.get("frequency") || "realtime") as Frequency;

  // Wiring: instancia adaptadores concretos
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const useCase = new SendNewsletterUseCase({
    subscriberRepo: new SupabaseSubscriberRepo(supabase),
    articleRepo: new SupabaseArticleRepo(supabase),
    emailSender: new ResendEmailSender(Deno.env.get("RESEND_API_KEY")!),
    buildEmailHtml: buildNewsletterHtml,
    siteUrl: Deno.env.get("SITE_URL") || "https://cartabrasil.com.br",
  });

  const result = await useCase.execute(frequency);

  return new Response(JSON.stringify(result), {
    headers: { "Content-Type": "application/json" },
  });
});
