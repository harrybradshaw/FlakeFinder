import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";

/**
 * Base repository class providing common database operations
 */
export abstract class BaseRepository {
  constructor(protected readonly supabase: SupabaseClient<Database>) {}

  /**
   * Get the Supabase client (for complex queries not covered by repository methods)
   */
  protected getClient(): SupabaseClient<Database> {
    return this.supabase;
  }
}
