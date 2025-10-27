import type { Database } from "@/types/supabase";
import { BaseRepository } from "./base-repository";

type Project = Database["public"]["Tables"]["projects"]["Row"];
type ProjectInsert = Database["public"]["Tables"]["projects"]["Insert"];
type OrganizationProject =
  Database["public"]["Tables"]["organization_projects"]["Insert"];

/**
 * Repository for projects and organization-project relationships
 */
export class ProjectRepository extends BaseRepository {
  /**
   * Get project by ID
   */
  async getProjectById(id: string): Promise<Project | null> {
    const { data, error } = await this.supabase
      .from("projects")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      if (error.code === "PGRST116") return null;
      throw new Error(`Failed to fetch project: ${error.message}`);
    }
    return data;
  }

  /**
   * Get project by API key
   */
  async getProjectByApiKey(apiKey: string): Promise<Project | null> {
    const { data, error } = await this.supabase
      .from("projects")
      .select("*")
      .eq("api_key", apiKey)
      .single();

    if (error) {
      if (error.code === "PGRST116") return null;
      throw new Error(`Failed to fetch project by API key: ${error.message}`);
    }
    return data;
  }

  /**
   * Get all projects for an organization
   */
  async getProjectsForOrganization(organizationId: string): Promise<Project[]> {
    const { data, error } = await this.supabase
      .from("projects")
      .select(
        `
        *,
        organization_projects!inner(organization_id)
      `,
      )
      .eq("organization_projects.organization_id", organizationId);

    if (error) throw new Error(`Failed to fetch projects: ${error.message}`);
    return data || [];
  }

  /**
   * Get all projects for a user (via organization membership)
   */
  async getProjectsForUser(userId: string): Promise<Project[]> {
    const { data, error } = await this.supabase
      .from("projects")
      .select(
        `
        *,
        organization_projects!inner(
          organization_id,
          organizations!inner(
            organization_members!inner(user_id)
          )
        )
      `,
      )
      .eq(
        "organization_projects.organizations.organization_members.user_id",
        userId,
      );

    if (error)
      throw new Error(`Failed to fetch user projects: ${error.message}`);
    return data || [];
  }

  /**
   * Create a new project
   */
  async createProject(project: ProjectInsert): Promise<Project> {
    const { data, error } = await this.supabase
      .from("projects")
      .insert(project)
      .select()
      .single();

    if (error) throw new Error(`Failed to create project: ${error.message}`);
    return data;
  }

  /**
   * Update project
   */
  async updateProject(
    id: string,
    updates: Partial<ProjectInsert>,
  ): Promise<Project> {
    const { data, error } = await this.supabase
      .from("projects")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) throw new Error(`Failed to update project: ${error.message}`);
    return data;
  }

  /**
   * Delete project
   */
  async deleteProject(id: string): Promise<void> {
    const { error } = await this.supabase
      .from("projects")
      .delete()
      .eq("id", id);

    if (error) throw new Error(`Failed to delete project: ${error.message}`);
  }

  /**
   * Link project to organization
   */
  async linkProjectToOrganization(
    projectId: string,
    organizationId: string,
  ): Promise<void> {
    const link: OrganizationProject = {
      project_id: projectId,
      organization_id: organizationId,
    };

    const { error } = await this.supabase
      .from("organization_projects")
      .insert(link);

    if (error)
      throw new Error(
        `Failed to link project to organization: ${error.message}`,
      );
  }

  /**
   * Unlink project from organization
   */
  async unlinkProjectFromOrganization(
    projectId: string,
    organizationId: string,
  ): Promise<void> {
    const { error } = await this.supabase
      .from("organization_projects")
      .delete()
      .eq("project_id", projectId)
      .eq("organization_id", organizationId);

    if (error)
      throw new Error(
        `Failed to unlink project from organization: ${error.message}`,
      );
  }

  /**
   * Get project with organization info
   */
  async getProjectWithOrganization(projectId: string): Promise<{
    name: string;
    organization_id: string;
  } | null> {
    const { data, error } = await this.supabase
      .from("organization_projects")
      .select("organization_id, project:projects(name)")
      .eq("project_id", projectId)
      .limit(1)
      .single();

    if (error) {
      if (error.code === "PGRST116") return null;
      throw new Error(
        `Failed to fetch project with organization: ${error.message}`,
      );
    }

    if (!data) return null;

    const project =
      typeof data.project === "object" &&
      data.project !== null &&
      "name" in data.project
        ? (data.project as { name: string })
        : null;

    if (!project) return null;

    return {
      name: project.name,
      organization_id: data.organization_id,
    };
  }

  /**
   * Get multiple projects by IDs
   */
  async getProjectsByIds(
    projectIds: string[],
    activeOnly = true,
  ): Promise<Project[]> {
    if (projectIds.length === 0) return [];

    let query = this.supabase
      .from("projects")
      .select("*")
      .in("id", projectIds)
      .order("name", { ascending: true });

    if (activeOnly) {
      query = query.eq("active", true);
    }

    const { data, error } = await query;

    if (error) throw new Error(`Failed to fetch projects: ${error.message}`);
    return data || [];
  }

  /**
   * Get project by name
   */
  async getProjectByName(name: string): Promise<Project | null> {
    const { data, error } = await this.supabase
      .from("projects")
      .select("*")
      .eq("name", name)
      .eq("active", true)
      .single();

    if (error) {
      if (error.code === "PGRST116") return null;
      throw new Error(`Failed to fetch project by name: ${error.message}`);
    }
    return data;
  }

  /**
   * Get organization-project relationships with details
   */
  async getOrganizationProjectRelationships(organizationIds: string[]) {
    if (organizationIds.length === 0) return [];

    const { data, error } = await this.supabase
      .from("organization_projects")
      .select(
        `
        *,
        project:projects(*),
        organization:organizations(*)
      `,
      )
      .in("organization_id", organizationIds);

    if (error)
      throw new Error(
        `Failed to fetch organization-project relationships: ${error.message}`,
      );
    return data || [];
  }

  /**
   * Create organization-project relationship
   */
  async createOrganizationProjectRelationship(
    organizationId: string,
    projectId: string,
  ) {
    const link: OrganizationProject = {
      organization_id: organizationId,
      project_id: projectId,
    };

    const { data, error } = await this.supabase
      .from("organization_projects")
      .insert(link)
      .select()
      .single();

    if (error)
      throw new Error(
        `Failed to create organization-project relationship: ${error.message}`,
      );
    return data;
  }

  /**
   * Delete organization-project relationship by ID
   */
  async deleteOrganizationProjectRelationship(
    relationshipId: string,
  ): Promise<void> {
    const { error } = await this.supabase
      .from("organization_projects")
      .delete()
      .eq("id", relationshipId);

    if (error)
      throw new Error(
        `Failed to delete organization-project relationship: ${error.message}`,
      );
  }
}
