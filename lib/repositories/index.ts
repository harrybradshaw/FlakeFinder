import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { MetricsRepository } from "./metrics-repository";
import { TestRunRepository } from "./test-run-repository";
import { WebhookRepository } from "./webhook-repository";
import { ProjectRepository } from "./project-repository";
import { OrganizationRepository } from "./organization-repository";
import { LookupRepository } from "./lookup-repository";

/**
 * Repository factory for creating repository instances
 */
export class RepositoryFactory {
  constructor(private readonly supabase: SupabaseClient<Database>) {}

  get metrics(): MetricsRepository {
    return new MetricsRepository(this.supabase);
  }

  get testRuns(): TestRunRepository {
    return new TestRunRepository(this.supabase);
  }

  get webhooks(): WebhookRepository {
    return new WebhookRepository(this.supabase);
  }

  get projects(): ProjectRepository {
    return new ProjectRepository(this.supabase);
  }

  get organizations(): OrganizationRepository {
    return new OrganizationRepository(this.supabase);
  }

  get lookups(): LookupRepository {
    return new LookupRepository(this.supabase);
  }
}

/**
 * Create a repository factory from a Supabase client
 */
export function createRepositories(
  supabase: SupabaseClient<Database>,
): RepositoryFactory {
  return new RepositoryFactory(supabase);
}

// Export all repositories
export { MetricsRepository } from "./metrics-repository";
export { TestRunRepository } from "./test-run-repository";
export { WebhookRepository } from "./webhook-repository";
export { ProjectRepository } from "./project-repository";
export { OrganizationRepository } from "./organization-repository";
export { LookupRepository } from "./lookup-repository";
export { BaseRepository } from "./base-repository";
