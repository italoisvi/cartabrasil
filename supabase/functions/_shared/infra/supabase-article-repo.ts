// ── ADAPTADOR: ARTICLE REPOSITORY (Supabase) ───────────────────
// Implementa a porta ArticleRepository.

import type {
  ArticleRepository,
  ArticleData,
  ArticleRecord,
} from "../domain/ports.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export class SupabaseArticleRepo implements ArticleRepository {
  constructor(private supabase: SupabaseClient) {}

  async findByOriginalUrl(url: string): Promise<{ id: string } | null> {
    const { data } = await this.supabase
      .from("articles")
      .select("id")
      .eq("original_url", url)
      .maybeSingle();

    return data;
  }

  async insert(article: ArticleData): Promise<void> {
    const { error } = await this.supabase.from("articles").insert({
      id: article.id,
      title: article.title,
      description: article.description,
      body: article.body,
      category: article.category,
      image_url: article.imageUrl,
      image_caption: article.imageCaption,
      source_name: article.sourceName,
      source_url: article.sourceUrl,
      author: article.author,
      original_url: article.originalUrl,
      published_at: article.publishedAt,
    });

    if (error) {
      console.error("Insert error:", error.message);
      throw error;
    }
  }

  async findRecent(since: Date, limit: number): Promise<ArticleRecord[]> {
    const { data, error } = await this.supabase
      .from("articles")
      .select("id, title, category, published_at")
      .gte("published_at", since.toISOString())
      .order("published_at", { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data ?? [];
  }
}
