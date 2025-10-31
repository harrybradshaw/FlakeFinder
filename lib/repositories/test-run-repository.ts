import type { Database } from "@/types/supabase";
import { BaseRepository } from "./base-repository";

type TestRun = Database["public"]["Tables"]["test_runs"]["Row"];
type TestRunInsert = Database["public"]["Tables"]["test_runs"]["Insert"];
type Test = Database["public"]["Tables"]["tests"]["Row"];
type TestInsert = Database["public"]["Tables"]["tests"]["Insert"];
type SuiteTest = Database["public"]["Tables"]["suite_tests"]["Row"];
type SuiteTestInsert = Database["public"]["Tables"]["suite_tests"]["Insert"];
type TestResult = Database["public"]["Tables"]["test_results"]["Insert"];

/**
 * Repository for test runs and tests data access
 */
export class TestRunRepository extends BaseRepository {
  /**
   * Create a new test run
   */
  async createTestRun(testRun: TestRunInsert): Promise<TestRun> {
    const { data, error } = await this.supabase
      .from("test_runs")
      .insert(testRun)
      .select()
      .single();

    if (error) throw new Error(`Failed to create test run: ${error.message}`);
    return data;
  }

  /**
   * Get test run by ID
   */
  async getTestRunById(id: string): Promise<TestRun | null> {
    const { data, error } = await this.supabase
      .from("test_runs")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      if (error.code === "PGRST116") return null; // Not found
      throw new Error(`Failed to fetch test run: ${error.message}`);
    }
    return data;
  }

  /**
   * Get test runs for a project
   */
  async getTestRunsForProject(projectId: string, limit = 50, offset = 0) {
    const { data, error, count } = await this.supabase
      .from("test_runs")
      .select("*", { count: "exact" })
      .eq("project_id", projectId)
      .order("timestamp", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw new Error(`Failed to fetch test runs: ${error.message}`);
    return { data: data || [], count: count || 0 };
  }

  /**
   * Get test run with full details (tests, suites, etc.)
   */
  async getTestRunWithDetails(id: string) {
    const { data, error } = await this.supabase
      .from("test_runs")
      .select(
        `
        *,
        projects(id, name),
        tests(
          id,
          test_name,
          status,
          duration,
          error_message,
          suite_tests(id, test_name, file_path)
        )
      `,
      )
      .eq("id", id)
      .single();

    if (error) {
      if (error.code === "PGRST116") return null;
      throw new Error(`Failed to fetch test run details: ${error.message}`);
    }
    return data;
  }

  /**
   * Insert multiple tests for a test run
   */
  async insertTests(tests: TestInsert[]): Promise<Test[]> {
    const { data, error } = await this.supabase
      .from("tests")
      .insert(tests)
      .select();

    if (error) throw new Error(`Failed to insert tests: ${error.message}`);
    return data || [];
  }

  /**
   * Get test by ID
   */
  async getTestById(id: string) {
    const { data, error } = await this.supabase
      .from("tests")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      if (error.code === "PGRST116") return null;
      throw new Error(`Failed to fetch test: ${error.message}`);
    }
    return data;
  }

  /**
   * Get tests for a test run
   */
  async getTestsForRun(testRunId: string) {
    const { data, error } = await this.supabase
      .from("tests")
      .select("*")
      .eq("test_run_id", testRunId)
      .order("test_name");

    if (error) throw new Error(`Failed to fetch tests: ${error.message}`);
    return data || [];
  }

  /**
   * Get test statistics for a project over a date range
   */
  async getTestStats(projectId: string, startDate: Date, endDate: Date) {
    const { data, error } = await this.supabase
      .from("tests")
      .select(
        `
        status,
        duration,
        test_runs!inner(project_id, timestamp)
      `,
      )
      .eq("test_runs.project_id", projectId)
      .gte("test_runs.timestamp", startDate.toISOString())
      .lte("test_runs.timestamp", endDate.toISOString());

    if (error) throw new Error(`Failed to fetch test stats: ${error.message}`);
    return data || [];
  }

  /**
   * Check for duplicate test run
   */
  async findDuplicateTestRun(
    projectId: string,
    commitSha: string | null,
    branch: string | null,
    timestamp: Date,
    toleranceMs = 60000,
  ) {
    const startTime = new Date(timestamp.getTime() - toleranceMs);
    const endTime = new Date(timestamp.getTime() + toleranceMs);

    const query = this.supabase
      .from("test_runs")
      .select("id, timestamp")
      .eq("project_id", projectId)
      .gte("timestamp", startTime.toISOString())
      .lte("timestamp", endTime.toISOString());

    if (commitSha) {
      query.eq("commit_sha", commitSha);
    }
    if (branch) {
      query.eq("branch", branch);
    }

    const { data, error } = await query.limit(1);

    if (error)
      throw new Error(`Failed to check for duplicates: ${error.message}`);
    return data && data.length > 0 ? data[0] : null;
  }

  /**
   * Get failure patterns for tests
   */
  async getFailurePatterns(projectId: string, _limit = 10, daysBack = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysBack);

    const { data, error } = await this.supabase
      .from("tests")
      .select(
        `
        suite_test_id,
        error_message,
        suite_tests!inner(test_name, file_path),
        test_runs!inner(project_id, timestamp)
      `,
      )
      .eq("test_runs.project_id", projectId)
      .eq("status", "failed")
      .gte("test_runs.timestamp", startDate.toISOString())
      .not("error_message", "is", null)
      .limit(1000); // Get a large sample

    if (error)
      throw new Error(`Failed to fetch failure patterns: ${error.message}`);
    return data || [];
  }

  /**
   * Upsert suite tests (canonical test definitions)
   */
  async upsertSuiteTests(suiteTests: SuiteTestInsert[]): Promise<SuiteTest[]> {
    const { data, error } = await this.supabase
      .from("suite_tests")
      .upsert(suiteTests, {
        onConflict: "project_id,file,name",
        ignoreDuplicates: false,
      })
      .select();

    if (error)
      throw new Error(`Failed to upsert suite tests: ${error.message}`);
    return data || [];
  }

  /**
   * Insert test results (retry attempts)
   */
  async insertTestResults(testResults: TestResult[]): Promise<void> {
    if (testResults.length === 0) return;

    const { error } = await this.supabase
      .from("test_results")
      .insert(testResults);

    if (error)
      throw new Error(`Failed to insert test results: ${error.message}`);
  }

  /**
   * Check for duplicate test run by content hash
   */
  async findDuplicateByContentHash(
    contentHash: string,
    projectId?: string | null,
  ): Promise<{ id: string; timestamp: string } | null> {
    let query = this.supabase
      .from("test_runs")
      .select("id, timestamp")
      .eq("content_hash", contentHash)
      .order("timestamp", { ascending: false })
      .limit(1);

    if (projectId) {
      query = query.eq("project_id", projectId);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to check for duplicates: ${error.message}`);
    }
    return data && data.length > 0 ? data[0] : null;
  }

  /**
   * Get suite test by ID
   */
  async getSuiteTestById(
    id: string,
  ): Promise<Pick<SuiteTest, "id" | "project_id" | "file" | "name"> | null> {
    const { data, error } = await this.supabase
      .from("suite_tests")
      .select("id, project_id, file, name")
      .eq("id", id)
      .single();

    if (error) {
      if (error.code === "PGRST116") return null;
      throw new Error(`Failed to fetch suite test: ${error.message}`);
    }
    return data;
  }

  /**
   * Get test runs for a project within a date range with optional filters
   */
  async getTestRunsInDateRange(
    projectId: string,
    startDate: Date,
    environmentId?: string | null,
    triggerId?: string | null,
  ) {
    let query = this.supabase
      .from("test_runs")
      .select("id, timestamp, branch")
      .eq("project_id", projectId)
      .gte("timestamp", startDate.toISOString())
      .order("timestamp", { ascending: true });

    if (environmentId) {
      query = query.eq("environment_id", environmentId);
    }
    if (triggerId) {
      query = query.eq("trigger_id", triggerId);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to fetch test runs: ${error.message}`);
    }
    return data || [];
  }

  /**
   * Get test history for a suite test with full context
   */
  async getTestHistory(suiteTestId: string, runIds: string[]) {
    if (runIds.length === 0) return [];

    const { data, error } = await this.supabase
      .from("tests")
      .select(
        `
        id,
        status, 
        duration,
        attempts,
        test_run_id, 
        created_at, 
        started_at,
        test_runs!inner(
          id,
          branch,
          environments(name),
          test_triggers(name)
        )
      `,
      )
      .order("started_at", { ascending: true })
      .in("test_run_id", runIds)
      .eq("suite_test_id", suiteTestId);

    if (error) {
      throw new Error(`Failed to fetch test history: ${error.message}`);
    }
    return data || [];
  }

  /**
   * Get a specific test with suite_test details by test_run_id and suite_test_id
   */
  async getTestWithSuiteDetails(testRunId: string, suiteTestId: string) {
    const { data, error } = await this.supabase
      .from("tests")
      .select("*, suite_test:suite_tests(name, file)")
      .eq("test_run_id", testRunId)
      .eq("suite_test_id", suiteTestId)
      .single();

    if (error) {
      if (error.code === "PGRST116") return null;
      throw new Error(`Failed to fetch test: ${error.message}`);
    }
    return data;
  }

  /**
   * Get test results (attempts/retries) for a specific test
   */
  async getTestResults(testId: string) {
    const { data, error } = await this.supabase
      .from("test_results")
      .select("*")
      .eq("test_id", testId)
      .order("retry_index", { ascending: true });

    if (error) {
      throw new Error(`Failed to fetch test results: ${error.message}`);
    }
    return data || [];
  }

  async getTestRunWithFullDetails(id: string) {
    const { data, error } = await this.supabase
      .from("test_runs")
      .select(
        `
        *,
        project:projects(name, display_name, color),
        environment:environments(name, display_name, color),
        trigger:test_triggers(name, display_name, icon)
      `,
      )
      .eq("id", id)
      .single();

    if (error) {
      if (error.code === "PGRST116") return null;
      throw new Error(`Failed to fetch test run: ${error.message}`);
    }
    return data;
  }

  /**
   * Get tests with suite_test details for a test run
   */
  async getTestsWithSuiteDetails(testRunId: string) {
    const { data, error } = await this.supabase
      .from("tests")
      .select(
        `
        *,
        suite_test:suite_tests(id, name, file)
      `,
      )
      .eq("test_run_id", testRunId)
      .order("created_at", { ascending: true });

    if (error) {
      throw new Error(`Failed to fetch tests: ${error.message}`);
    }
    return data || [];
  }

  /**
   * Get test results for multiple test IDs
   */
  async getTestResultsForTests(testIds: string[]) {
    if (testIds.length === 0) return [];

    const { data, error } = await this.supabase
      .from("test_results")
      .select("*")
      .in("test_id", testIds)
      .order("retry_index", { ascending: true });

    if (error) {
      throw new Error(`Failed to fetch test results: ${error.message}`);
    }
    return data || [];
  }

  /**
   * Get test runs by project IDs with filters (for aggregation)
   */
  async getTestRunsByProjects(
    projectIds: string[],
    startDate: Date,
    environmentId?: string | null,
    triggerId?: string | null,
  ) {
    if (projectIds.length === 0) return [];

    let query = this.supabase
      .from("test_runs")
      .select("id")
      .gte("timestamp", startDate.toISOString())
      .in("project_id", projectIds);

    if (environmentId) {
      query = query.eq("environment_id", environmentId);
    }
    if (triggerId) {
      query = query.eq("trigger_id", triggerId);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to fetch test runs: ${error.message}`);
    }
    return data || [];
  }

  /**
   * Get test history for a suite test with full context (optimized version)
   */
  async getTestHistoryOptimized(
    suiteTestId: string,
    startDate: Date,
    environmentId?: string | null,
    triggerId?: string | null,
  ) {
    let query = this.supabase
      .from("tests")
      .select(
        `
        status,
        duration,
        attempts,
        started_at,
        test_run_id,
        test_runs!inner(
          id,
          timestamp,
          branch,
          environments(name),
          test_triggers(name)
        )
      `,
      )
      .eq("suite_test_id", suiteTestId);

    // Apply date filter via test_runs timestamp
    query = query.gte("test_runs.timestamp", startDate.toISOString());

    // Order by test run start time (most recent first)
    query = query.order("timestamp", {
      ascending: false,
      foreignTable: "test_runs",
    });

    // Apply environment filter if provided
    if (environmentId) {
      query = query.eq("test_runs.environment_id", environmentId);
    }

    // Apply trigger filter if provided
    if (triggerId) {
      query = query.eq("test_runs.trigger_id", triggerId);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to fetch test history: ${error.message}`);
    }
    return data || [];
  }

  /**
   * Get failed tests for failure pattern analysis (optimized version)
   */
  async getFailedTestsForPatternAnalysis(
    accessibleProjectIds: string[],
    startDate: Date,
    projectId?: string | null,
    environmentId?: string | null,
    triggerId?: string | null,
    testId?: string | null,
    suiteTestIds?: string[] | null,
  ) {
    let query = this.supabase
      .from("tests")
      .select(
        `
        id,
        test_run_id,
        status,
        error,
        screenshots,
        suite_tests!inner(
          id,
          name,
          file
        ),
        test_runs!inner(
          id,
          timestamp,
          branch,
          project_id,
          environments(name),
          test_triggers(name)
        )
      `,
      )
      .eq("status", "failed")
      .gte("test_runs.timestamp", startDate.toISOString());

    // Apply project filter
    if (projectId) {
      query = query.eq("test_runs.project_id", projectId);
    } else {
      // Filter by accessible projects
      query = query.in("test_runs.project_id", accessibleProjectIds);
    }

    // Apply other filters
    if (environmentId) {
      query = query.eq("test_runs.environment_id", environmentId);
    }
    if (triggerId) {
      query = query.eq("test_runs.trigger_id", triggerId);
    }
    if (testId) {
      query = query.eq("suite_tests.id", testId);
    }
    if (suiteTestIds) {
      query = query.in("suite_tests.id", suiteTestIds);
    }

    // Order by most recent and limit to avoid huge result sets
    query = query
      .order("timestamp", { ascending: false, foreignTable: "test_runs" })
      .limit(1000);

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to fetch failed tests: ${error.message}`);
    }
    return data || [];
  }
  async getTestRunStats(
    projectIds: string[],
    startDate: Date,
    projectId?: string | null,
    environmentId?: string | null,
    triggerId?: string | null,
    testRunIds?: string[] | null,
  ) {
    if (projectIds.length === 0) return [];

    let query = this.supabase
      .from("test_runs")
      .select("total, passed, failed, flaky")
      .in("project_id", projectIds)
      .gte("timestamp", startDate.toISOString());

    if (projectId) {
      query = query.eq("project_id", projectId);
    }
    if (environmentId) {
      query = query.eq("environment_id", environmentId);
    }
    if (triggerId) {
      query = query.eq("trigger_id", triggerId);
    }
    if (testRunIds && testRunIds.length > 0) {
      query = query.in("id", testRunIds);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to fetch test run stats: ${error.message}`);
    }
    return data || [];
  }

  /**
   * Get suite test IDs by suite ID
   */
  async getSuiteTestIdsBySuite(suiteId: string): Promise<string[]> {
    const { data, error } = await this.supabase
      .from("suite_tests")
      .select("id")
      .eq("suite_id", suiteId);

    if (error) {
      throw new Error(`Failed to fetch suite tests: ${error.message}`);
    }
    return (data || []).map((st) => st.id);
  }

  /**
   * Get test run IDs by suite test IDs
   */
  async getTestRunIdsBySuiteTests(suiteTestIds: string[]): Promise<string[]> {
    if (suiteTestIds.length === 0) return [];

    const { data, error } = await this.supabase
      .from("tests")
      .select("test_run_id")
      .in("suite_test_id", suiteTestIds);

    if (error) {
      throw new Error(`Failed to fetch test runs by suite: ${error.message}`);
    }
    return [...new Set((data || []).map((t) => t.test_run_id))];
  }

  /**
   * Get test run trends data with filters
   */
  async getTestRunTrends(
    projectIds: string[],
    startDate: Date,
    projectId?: string | null,
    environmentId?: string | null,
    triggerId?: string | null,
    testRunIds?: string[] | null,
  ) {
    if (projectIds.length === 0) return [];

    let query = this.supabase
      .from("test_runs")
      .select(
        "id, timestamp, total, passed, failed, flaky, wall_clock_duration",
      )
      .in("project_id", projectIds)
      .gte("timestamp", startDate.toISOString())
      .order("timestamp", { ascending: true });

    if (projectId) {
      query = query.eq("project_id", projectId);
    }
    if (environmentId) {
      query = query.eq("environment_id", environmentId);
    }
    if (triggerId) {
      query = query.eq("trigger_id", triggerId);
    }
    if (testRunIds && testRunIds.length > 0) {
      query = query.in("id", testRunIds);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to fetch test run trends: ${error.message}`);
    }
    return data || [];
  }

  /**
   * Get test runs for failure analysis
   */
  async getTestRunsForFailureAnalysis(
    projectIds: string[],
    startDate: Date,
    projectId?: string | null,
    environmentId?: string | null,
    triggerId?: string | null,
  ) {
    if (projectIds.length === 0) return [];

    let query = this.supabase
      .from("test_runs")
      .select("id, timestamp")
      .in("project_id", projectIds)
      .gte("timestamp", startDate.toISOString())
      .order("timestamp", { ascending: false });

    if (projectId) {
      query = query.eq("project_id", projectId);
    }
    if (environmentId) {
      query = query.eq("environment_id", environmentId);
    }
    if (triggerId) {
      query = query.eq("trigger_id", triggerId);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(
        `Failed to fetch test runs for failure analysis: ${error.message}`,
      );
    }
    return data || [];
  }

  /**
   * Get tests with suite info for failure analysis
   */
  async getTestsForFailureAnalysis(
    runIds: string[],
    suiteTestId?: string | null,
    suiteTestIds?: string[] | null,
  ) {
    if (runIds.length === 0) return [];

    let query = this.supabase
      .from("tests")
      .select(
        `
        id,
        test_run_id,
        suite_test_id,
        status,
        suite_tests!inner(name, file)
      `,
      )
      .in("test_run_id", runIds);

    if (suiteTestId) {
      query = query.eq("suite_test_id", suiteTestId);
    }
    if (suiteTestIds && suiteTestIds.length > 0) {
      query = query.in("suite_test_id", suiteTestIds);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(
        `Failed to fetch tests for failure analysis: ${error.message}`,
      );
    }
    return data || [];
  }

  /**
   * Get failed test results for pattern analysis
   */
  async getFailedTestResults(testIds: string[]) {
    if (testIds.length === 0) return [];

    const { data, error } = await this.supabase
      .from("test_results")
      .select(
        "id, test_id, status, duration, error, steps_url, last_failed_step, screenshots",
      )
      .in("test_id", testIds)
      .eq("status", "failed");

    if (error) {
      throw new Error(`Failed to fetch failed test results: ${error.message}`);
    }
    return data || [];
  }

  /**
   * Get test result steps URL
   */
  async getTestResultStepsUrl(testResultId: string): Promise<string | null> {
    const { data, error } = await this.supabase
      .from("test_results")
      .select("steps_url")
      .eq("id", testResultId)
      .single();

    if (error) {
      if (error.code === "PGRST116") return null;
      throw new Error(`Failed to fetch test result: ${error.message}`);
    }
    return data?.steps_url || null;
  }
}
