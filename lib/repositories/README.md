# Repository Pattern

This directory contains the repository layer for database access, following the Repository Pattern to separate data access logic from business logic.

## Architecture

```
┌─────────────────┐
│  API Routes /   │
│  Services       │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Repositories   │  ← You are here
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Supabase DB    │
└─────────────────┘
```

## Benefits

1. **Testability** - Mock repositories instead of complex Supabase queries
2. **Type Safety** - Centralized type definitions for all database operations
3. **Reusability** - Common queries in one place
4. **Maintainability** - Changes to database schema only affect repositories
5. **Migration Path** - Easier to switch databases in the future

## Available Repositories

### MetricsRepository

Handles metrics and alerts data:

- Flakiness metrics (aggregation, retrieval)
- Performance metrics (aggregation, baseline queries)
- Alerts (flakiness, performance, with test details)

### TestRunRepository

Handles test runs and test results:

- CRUD operations for test runs
- Test insertion and retrieval
- Test statistics and trends
- Duplicate detection
- Failure pattern analysis

### WebhookRepository

Handles webhook configurations and deliveries:

- Webhook CRUD operations
- Delivery logging and retrieval
- Retry functionality

### ProjectRepository

Handles projects and organization relationships:

- Project CRUD operations
- Organization linking
- User project access

### OrganizationRepository

Handles organizations and memberships:

- Organization CRUD operations
- Member management (add, remove, update role)
- Role checking and membership queries

## Usage

### Basic Usage

```typescript
import { createClient } from "@supabase/supabase-js";
import { createRepositories } from "@/lib/repositories";

const supabase = createClient(url, key);
const repos = createRepositories(supabase);

// Use repositories
const metrics = await repos.metrics.getFlakinessMetricsForDate("2025-01-15");
const testRun = await repos.testRuns.getTestRunById("run-123");
const webhooks = await repos.webhooks.getActiveWebhooksForOrganization("org-1");
```

### In API Routes

```typescript
import { createClient } from "@/lib/supabase/server";
import { createRepositories } from "@/lib/repositories";

export async function GET(request: Request) {
  const supabase = createClient();
  const repos = createRepositories(supabase);

  const projects = await repos.projects.getProjectsForUser(userId);
  return Response.json(projects);
}
```

### In Services/Business Logic

```typescript
import type { MetricsRepository } from "@/lib/repositories";

export async function aggregateFlakinessMetrics(
  metricsRepo: MetricsRepository,
  date: string,
): Promise<number> {
  // Fetch data
  const tests = await metricsRepo.getTestsForDateRange(startDate, endDate);

  // Business logic
  const metrics = calculateMetrics(tests);

  // Save results
  await metricsRepo.saveFlakinessMetrics(metrics);

  return metrics.length;
}
```

## Testing

### Unit Tests with Mocked Repositories

```typescript
import { describe, it, expect, vi } from "vitest";
import type { MetricsRepository } from "@/lib/repositories";

describe("aggregateFlakinessMetrics", () => {
  it("should calculate and save metrics", async () => {
    // Mock repository
    const mockRepo: Partial<MetricsRepository> = {
      getTestsForDateRange: vi.fn().mockResolvedValue([
        { suite_test_id: "test-1", status: "flaky", duration: 1000 },
        { suite_test_id: "test-1", status: "passed", duration: 900 },
      ]),
      saveFlakinessMetrics: vi.fn(),
    };

    // Test business logic
    const count = await aggregateFlakinessMetrics(
      mockRepo as MetricsRepository,
      "2025-01-15",
    );

    expect(count).toBe(1);
    expect(mockRepo.saveFlakinessMetrics).toHaveBeenCalledWith([
      expect.objectContaining({
        suite_test_id: "test-1",
        flake_rate: 50,
      }),
    ]);
  });
});
```

### Integration Tests

For integration tests, you can still use MSW to mock the Supabase HTTP layer, or use a test database.

## Migration Guide

### Before (Direct Supabase Calls)

```typescript
export async function getMetrics(supabase: SupabaseClient, date: string) {
  const { data, error } = await supabase
    .from("test_flakiness_metrics")
    .select("*")
    .eq("date", date);

  if (error) throw new Error(error.message);
  return data;
}
```

### After (Repository Pattern)

```typescript
// In repository
export class MetricsRepository {
  async getFlakinessMetricsForDate(date: string) {
    const { data, error } = await this.supabase
      .from("test_flakiness_metrics")
      .select("suite_test_id, flake_rate, total_runs, flaky_runs")
      .eq("date", date);

    if (error) throw new Error(`Failed to fetch metrics: ${error.message}`);
    return data || [];
  }
}

// In service/API
export async function getMetrics(metricsRepo: MetricsRepository, date: string) {
  return await metricsRepo.getFlakinessMetricsForDate(date);
}
```

## Best Practices

1. **Keep repositories focused** - Each repository handles one domain entity
2. **Return typed data** - Use TypeScript types from `Database` schema
3. **Handle errors consistently** - Throw descriptive errors
4. **Avoid business logic** - Repositories only handle data access
5. **Use transactions when needed** - For multi-step operations
6. **Document complex queries** - Add comments for non-obvious queries

## Adding a New Repository

1. Create a new file in `lib/repositories/`
2. Extend `BaseRepository`
3. Define types from `Database` schema
4. Implement methods
5. Export from `index.ts`
6. Add to `RepositoryFactory`

Example:

```typescript
// lib/repositories/suite-repository.ts
import type { Database } from "@/types/supabase";
import { BaseRepository } from "./base-repository";

type Suite = Database["public"]["Tables"]["suites"]["Row"];

export class SuiteRepository extends BaseRepository {
  async getSuiteById(id: string): Promise<Suite | null> {
    const { data, error } = await this.supabase
      .from("suites")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      if (error.code === "PGRST116") return null;
      throw new Error(`Failed to fetch suite: ${error.message}`);
    }
    return data;
  }
}
```

Then add to `index.ts`:

```typescript
export { SuiteRepository } from "./suite-repository";

export class RepositoryFactory {
  // ...
  get suites(): SuiteRepository {
    return new SuiteRepository(this.supabase);
  }
}
```
