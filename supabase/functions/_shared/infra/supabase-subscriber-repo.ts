// ── ADAPTADOR: SUBSCRIBER REPOSITORY (Supabase) ────────────────
// Implementa a porta SubscriberRepository.

import type {
  SubscriberRepository,
  SubscriberRecord,
  Frequency,
} from "../domain/ports.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export class SupabaseSubscriberRepo implements SubscriberRepository {
  constructor(private supabase: SupabaseClient) {}

  async findActiveByFrequency(
    frequency: Frequency,
  ): Promise<SubscriberRecord[]> {
    const { data, error } = await this.supabase
      .from("subscribers")
      .select("email, categories")
      .eq("active", true)
      .eq("frequency", frequency);

    if (error) throw error;
    return data ?? [];
  }
}
