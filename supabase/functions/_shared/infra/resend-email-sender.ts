// ── ADAPTADOR: EMAIL SENDER (Resend API) ───────────────────────
// Implementa a porta EmailSender.

import type { EmailSender } from "../domain/ports.ts";

export class ResendEmailSender implements EmailSender {
  constructor(private apiKey: string) {}

  async send(to: string, subject: string, html: string): Promise<boolean> {
    const res = await globalThis.fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Carta Brasil <onboarding@resend.dev>",
        to: [to],
        subject,
        html,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error(`Erro ao enviar para ${to}:`, err);
      return false;
    }

    return true;
  }
}
