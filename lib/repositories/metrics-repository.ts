import type { Database } from "@/types/supabase";
import { BaseRepository } from "./base-repository";

type FlakinessMetric =
  Database["public"]["Tables"]["test_flakiness_metrics"]["Insert"];
type PerformanceMetric =
  Database["public"]["Tables"]["test_performance_metrics"]["Insert"];
type FlakinessAlert =
  Database["public"]["Tables"]["flakiness_alerts"]["Insert"];
type PerformanceAlert =
  Database["public"]["Tables"]["performance_alerts"]["Insert"];

/**
 * Repository for metrics and alerts data access
 */
export class MetricsRepository extends BaseRepository {
  /**
   * Get all tests for a specific date range
   */
  async getTestsForDateRange(startDate: Date, endDate: Date) {
    const { data, error } = await this.supabase
      .from("tests")
      .select(
        `
        suite_test_id,
        status,
        duration,
        test_runs!inner(timestamp)
      `,
      )
      .gte("test_runs.timestamp", startDate.toISOString())
      .lte("test_runs.timestamp", endDate.toISOString())
      .not("suite_test_id", "is", null);

    if (error) throw new Error(`Failed to fetch tests: ${error.message}`);
    return data || [];
  }

  /**
   * Save flakiness metrics
   */
  async saveFlakinessMetrics(metrics: FlakinessMetric[]) {
    const { error } = await this.supabase
      .from("test_flakiness_metrics")
      .insert(metrics);

    if (error)
      throw new Error(`Failed to save flakiness metrics: ${error.message}`);
  }

  /**
   * Save performance metrics
   */
  async savePerformanceMetrics(metrics: PerformanceMetric[]) {
    const { error } = await this.supabase
      .from("test_performance_metrics")
      .insert(metrics);

    if (error)
      throw new Error(`Failed to save performance metrics: ${error.message}`);
  }

  /**
   * Get flakiness metrics for a specific date
   */
  async getFlakinessMetricsForDate(date: string) {
    const { data, error } = await this.supabase
      .from("test_flakiness_metrics")
      .select("suite_test_id, flake_rate, total_runs, flaky_runs")
      .eq("date", date);

    if (error)
      throw new Error(`Failed to fetch flakiness metrics: ${error.message}`);
    return data || [];
  }

  /**
   * Get performance metrics for a specific date
   */
  async getPerformanceMetricsForDate(date: string) {
    const { data, error } = await this.supabase
      .from("test_performance_metrics")
      .select("suite_test_id, avg_duration, p95_duration")
      .eq("date", date);

    if (error)
      throw new Error(`Failed to fetch performance metrics: ${error.message}`);
    return data || [];
  }

  /**
   * Get performance baseline for specific tests over a date range
   */
  async getPerformanceBaseline(
    suiteTestIds: string[],
    startDate: string,
    endDate: string,
  ) {
    const { data, error } = await this.supabase
      .from("test_performance_metrics")
      .select("suite_test_id, avg_duration")
      .in("suite_test_id", suiteTestIds)
      .gte("date", startDate)
      .lt("date", endDate);

    if (error)
      throw new Error(`Failed to fetch performance baseline: ${error.message}`);
    return data || [];
  }

  /**
   * Get existing flakiness alerts for specific tests within a time window
   */
  async getRecentFlakinessAlerts(suiteTestIds: string[], sinceDate: Date) {
    const { data, error } = await this.supabase
      .from("flakiness_alerts")
      .select("suite_test_id, triggered_at")
      .in("suite_test_id", suiteTestIds)
      .gte("triggered_at", sinceDate.toISOString());

    if (error)
      throw new Error(`Failed to fetch recent alerts: ${error.message}`);
    return data || [];
  }

  /**
   * Save flakiness alerts
   */
  async saveFlakinessAlerts(alerts: FlakinessAlert[]) {
    const { error } = await this.supabase
      .from("flakiness_alerts")
      .insert(alerts);

    if (error)
      throw new Error(`Failed to save flakiness alerts: ${error.message}`);
  }

  /**
   * Save performance alerts
   */
  async savePerformanceAlerts(alerts: PerformanceAlert[]) {
    const { error } = await this.supabase
      .from("performance_alerts")
      .insert(alerts);

    if (error)
      throw new Error(`Failed to save performance alerts: ${error.message}`);
  }

  /**
   * Get flakiness alerts with full test details for webhook notifications
   */
  async getFlakinessAlertsWithDetails(date: string) {
    const { data, error } = await this.supabase
      .from("flakiness_alerts")
      .select(
        `
        *,
        suite_tests!inner(
          id,
          test_name,
          file_path,
          projects!inner(
            id,
            name,
            organization_id
          )
        )
      `,
      )
      .eq("metadata->>date", date);

    if (error)
      throw new Error(
        `Failed to fetch flakiness alerts with details: ${error.message}`,
      );
    return data || [];
  }

  /**
   * Get performance alerts with full test details for webhook notifications
   */
  async getPerformanceAlertsWithDetails(date: string) {
    const { data, error } = await this.supabase
      .from("performance_alerts")
      .select(
        `
        *,
        suite_tests!inner(
          id,
          test_name,
          file_path,
          projects!inner(
            id,
            name,
            organization_id
          )
        )
      `,
      )
      .eq("metadata->>date", date);

    if (error)
      throw new Error(
        `Failed to fetch performance alerts with details: ${error.message}`,
      );
    return data || [];
  }
}
