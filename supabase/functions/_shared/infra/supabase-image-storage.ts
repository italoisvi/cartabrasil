// ── ADAPTADOR: IMAGE STORAGE (Supabase Storage) ────────────────
// Implementa a porta ImageStorage.

import type { ImageStorage } from "../domain/ports.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export class SupabaseImageStorage implements ImageStorage {
  constructor(private supabase: SupabaseClient) {}

  async upload(
    imageUrl: string,
    articleId: string,
  ): Promise<string | null> {
    try {
      const response = await globalThis.fetch(imageUrl);
      if (!response.ok) return null;

      const blob = await response.blob();
      const ext = imageUrl.includes(".png") ? "png" : "jpg";
      const path = `${articleId}.${ext}`;

      const { error } = await this.supabase.storage
        .from("article-images")
        .upload(path, blob, {
          contentType: blob.type || `image/${ext}`,
          upsert: true,
        });

      if (error) {
        console.error("Upload error:", error.message);
        return null;
      }

      const {
        data: { publicUrl },
      } = this.supabase.storage.from("article-images").getPublicUrl(path);

      return publicUrl;
    } catch (err) {
      console.error("Image fetch error:", err);
      return null;
    }
  }

  /**
   * Extrai todas as <img src> do body HTML, faz upload de cada uma
   * para o Storage e retorna o HTML com URLs substituídas.
   */
  async uploadBodyImages(
    bodyHtml: string,
    articleId: string,
  ): Promise<string> {
    const imgRegex = /<img\s[^>]*src="([^"]+)"[^>]*>/gi;
    const matches = [...bodyHtml.matchAll(imgRegex)];

    if (matches.length === 0) return bodyHtml;

    let result = bodyHtml;
    let index = 0;

    for (const match of matches) {
      const originalUrl = match[1];

      // Pular URLs já no Supabase Storage, relativas, ou placeholders
      if (originalUrl.includes("supabase.co")) continue;
      if (!originalUrl.startsWith("http")) continue;
      if (originalUrl.includes("loading_v2.gif")) continue;

      try {
        const response = await globalThis.fetch(originalUrl);
        if (!response.ok) continue;

        const blob = await response.blob();
        const ext = originalUrl.includes(".png") ? "png" : "jpg";
        const path = `${articleId}_body_${index}.${ext}`;

        const { error } = await this.supabase.storage
          .from("article-images")
          .upload(path, blob, {
            contentType: blob.type || `image/${ext}`,
            upsert: true,
          });

        if (error) {
          console.error("Body image upload error:", error.message);
          continue;
        }

        const {
          data: { publicUrl },
        } = this.supabase.storage.from("article-images").getPublicUrl(path);

        result = result.replace(originalUrl, publicUrl);
        index++;
      } catch (err) {
        console.error("Body image fetch error:", err);
      }
    }

    return result;
  }
}
