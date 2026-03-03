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
}
