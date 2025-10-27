import type { Database } from "@/types/supabase";
import { BaseRepository } from "./base-repository";

type Environment = Database["public"]["Tables"]["environments"]["Row"];
type Trigger = Database["public"]["Tables"]["test_triggers"]["Row"];
type Suite = Database["public"]["Tables"]["suites"]["Row"];

/**
 * Repository for lookup tables (environments, triggers, suites)
 */
export class LookupRepository extends BaseRepository {
  /**
   * Get environment by name
   */
  async getEnvironmentByName(name: string): Promise<Environment | null> {
    const { data, error } = await this.supabase
      .from("environments")
      .select("*")
      .eq("name", name)
      .eq("active", true)
      .single();

    if (error) {
      if (error.code === "PGRST116") return null;
      throw new Error(`Failed to fetch environment: ${error.message}`);
    }
    return data;
  }

  /**
   * Get trigger by name
   */
  async getTriggerByName(name: string): Promise<Trigger | null> {
    const { data, error } = await this.supabase
      .from("test_triggers")
      .select("*")
      .eq("name", name)
      .eq("active", true)
      .single();

    if (error) {
      if (error.code === "PGRST116") return null;
      throw new Error(`Failed to fetch trigger: ${error.message}`);
    }
    return data;
  }

  /**
   * Get suite by ID
   */
  async getSuiteById(id: string): Promise<Suite | null> {
    const { data, error } = await this.supabase
      .from("suites")
      .select("*")
      .eq("id", id)
      .eq("active", true)
      .single();

    if (error) {
      if (error.code === "PGRST116") return null;
      throw new Error(`Failed to fetch suite: ${error.message}`);
    }
    return data;
  }

  /**
   * Get suite by name
   */
  async getSuiteByName(name: string): Promise<Suite | null> {
    const { data, error } = await this.supabase
      .from("suites")
      .select("*")
      .eq("name", name)
      .eq("active", true)
      .single();

    if (error) {
      if (error.code === "PGRST116") return null;
      throw new Error(`Failed to fetch suite: ${error.message}`);
    }
    return data;
  }

  /**
   * Get suites for projects with optional project filter
   */
  async getSuitesForProjects(
    projectIds: string[],
    specificProjectId?: string | null,
  ) {
    if (projectIds.length === 0) return [];

    let query = this.supabase
      .from("suites")
      .select(
        "id, name, description, project_id, project:projects(name, display_name, color)",
      )
      .eq("active", true)
      .in("project_id", projectIds)
      .order("name", { ascending: true });

    if (specificProjectId) {
      query = query.eq("project_id", specificProjectId);
    }

    const { data, error } = await query;

    if (error) throw new Error(`Failed to fetch suites: ${error.message}`);
    return data || [];
  }

  /**
   * Create suite
   */
  async createSuite(suite: {
    name: string;
    description?: string | null;
    project_id: string;
  }): Promise<Suite> {
    const { data, error } = await this.supabase
      .from("suites")
      .insert(suite)
      .select()
      .single();

    if (error) throw new Error(`Failed to create suite: ${error.message}`);
    return data;
  }

  /**
   * Get all active environments
   */
  async getActiveEnvironments() {
    const { data, error } = await this.supabase
      .from("environments")
      .select("*")
      .eq("active", true)
      .order("name", { ascending: true });

    if (error)
      throw new Error(`Failed to fetch environments: ${error.message}`);
    return data || [];
  }

  /**
   * Get all active triggers
   */
  async getActiveTriggers() {
    const { data, error } = await this.supabase
      .from("test_triggers")
      .select("*")
      .eq("active", true)
      .order("name", { ascending: true });

    if (error) throw new Error(`Failed to fetch triggers: ${error.message}`);
    return data || [];
  }

  /**
   * Get suite project ID
   */
  async getSuiteProjectId(suiteId: string): Promise<string | null> {
    const { data, error } = await this.supabase
      .from("suites")
      .select("project_id")
      .eq("id", suiteId)
      .eq("active", true)
      .single();

    if (error) {
      if (error.code === "PGRST116") return null;
      throw new Error(`Failed to fetch suite project: ${error.message}`);
    }
    return data?.project_id || null;
  }

  /**
   * Get user's organization IDs
   */
  async getUserOrganizations(userId: string): Promise<string[]> {
    const { data, error } = await this.supabase
      .from("user_organizations")
      .select("organization_id")
      .eq("user_id", userId);

    if (error)
      throw new Error(`Failed to fetch user organizations: ${error.message}`);
    return (data || []).map((row) => row.organization_id);
  }

  /**
   * Check if user's organization has access to project
   */
  async checkOrganizationProjectAccess(
    projectId: string,
    organizationIds: string[],
  ): Promise<boolean> {
    const { data, error } = await this.supabase
      .from("organization_projects")
      .select("organization_id")
      .eq("project_id", projectId)
      .in("organization_id", organizationIds)
      .limit(1);

    if (error)
      throw new Error(`Failed to check organization access: ${error.message}`);
    return (data || []).length > 0;
  }

  /**
   * Get all accessible project IDs for user's organizations
   */
  async getAccessibleProjectIds(organizationIds: string[]): Promise<string[]> {
    if (organizationIds.length === 0) return [];

    const { data, error } = await this.supabase
      .from("organization_projects")
      .select("project_id")
      .in("organization_id", organizationIds);

    if (error)
      throw new Error(
        `Failed to fetch organization projects: ${error.message}`,
      );
    return (data || []).map((row) => row.project_id);
  }
}
