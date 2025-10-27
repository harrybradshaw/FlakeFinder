import type { Database } from "@/types/supabase";
import { BaseRepository } from "./base-repository";

type Organization = Database["public"]["Tables"]["organizations"]["Row"];
type OrganizationInsert =
  Database["public"]["Tables"]["organizations"]["Insert"];
type UserOrganization =
  Database["public"]["Tables"]["user_organizations"]["Insert"];

/**
 * Repository for organizations and organization members
 */
export class OrganizationRepository extends BaseRepository {
  /**
   * Get organization by ID
   */
  async getOrganizationById(id: string): Promise<Organization | null> {
    const { data, error } = await this.supabase
      .from("organizations")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      if (error.code === "PGRST116") return null;
      throw new Error(`Failed to fetch organization: ${error.message}`);
    }
    return data;
  }

  /**
   * Get all organizations for a user
   */
  async getOrganizationsForUser(userId: string): Promise<Organization[]> {
    const { data, error } = await this.supabase
      .from("organizations")
      .select(
        `
        *,
        user_organizations!inner(user_id, role)
      `,
      )
      .eq("user_organizations.user_id", userId);

    if (error)
      throw new Error(`Failed to fetch user organizations: ${error.message}`);
    return data || [];
  }

  /**
   * Create a new organization
   */
  async createOrganization(
    organization: OrganizationInsert,
  ): Promise<Organization> {
    const { data, error } = await this.supabase
      .from("organizations")
      .insert(organization)
      .select()
      .single();

    if (error)
      throw new Error(`Failed to create organization: ${error.message}`);
    return data;
  }

  /**
   * Update organization
   */
  async updateOrganization(
    id: string,
    updates: Partial<OrganizationInsert>,
  ): Promise<Organization> {
    const { data, error } = await this.supabase
      .from("organizations")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error)
      throw new Error(`Failed to update organization: ${error.message}`);
    return data;
  }

  /**
   * Delete organization
   */
  async deleteOrganization(id: string): Promise<void> {
    const { error } = await this.supabase
      .from("organizations")
      .delete()
      .eq("id", id);

    if (error)
      throw new Error(`Failed to delete organization: ${error.message}`);
  }

  /**
   * Add member to organization
   */
  async addMember(
    organizationId: string,
    userId: string,
    role: "owner" | "admin" | "member" = "member",
  ): Promise<void> {
    const member: UserOrganization = {
      organization_id: organizationId,
      user_id: userId,
      role,
    };

    const { error } = await this.supabase
      .from("user_organizations")
      .insert(member);

    if (error) throw new Error(`Failed to add member: ${error.message}`);
  }

  /**
   * Remove member from organization
   */
  async removeMember(organizationId: string, userId: string): Promise<void> {
    const { error } = await this.supabase
      .from("user_organizations")
      .delete()
      .eq("organization_id", organizationId)
      .eq("user_id", userId);

    if (error) throw new Error(`Failed to remove member: ${error.message}`);
  }

  /**
   * Update member role
   */
  async updateMemberRole(
    organizationId: string,
    userId: string,
    role: "owner" | "admin" | "member",
  ): Promise<void> {
    const { error } = await this.supabase
      .from("user_organizations")
      .update({ role })
      .eq("organization_id", organizationId)
      .eq("user_id", userId);

    if (error)
      throw new Error(`Failed to update member role: ${error.message}`);
  }

  /**
   * Get all members of an organization
   */
  async getMembers(organizationId: string) {
    const { data, error } = await this.supabase
      .from("user_organizations")
      .select("*")
      .eq("organization_id", organizationId);

    if (error) throw new Error(`Failed to fetch members: ${error.message}`);
    return data || [];
  }

  /**
   * Check if user is member of organization
   */
  async isMember(organizationId: string, userId: string): Promise<boolean> {
    const { data, error } = await this.supabase
      .from("user_organizations")
      .select("user_id")
      .eq("organization_id", organizationId)
      .eq("user_id", userId)
      .single();

    if (error) {
      if (error.code === "PGRST116") return false;
      throw new Error(`Failed to check membership: ${error.message}`);
    }
    return !!data;
  }

  /**
   * Get user's role in organization
   */
  async getUserRole(
    organizationId: string,
    userId: string,
  ): Promise<"owner" | "admin" | "member" | null> {
    const { data, error } = await this.supabase
      .from("user_organizations")
      .select("role")
      .eq("organization_id", organizationId)
      .eq("user_id", userId)
      .single();

    if (error) {
      if (error.code === "PGRST116") return null;
      throw new Error(`Failed to fetch user role: ${error.message}`);
    }
    return data.role as "owner" | "admin" | "member";
  }

  /**
   * Get organizations for user with role information
   */
  async getOrganizationsWithRole(userId: string) {
    const { data, error } = await this.supabase
      .from("user_organizations")
      .select(
        `
        *,
        organization:organizations(*)
      `,
      )
      .eq("user_id", userId);

    if (error)
      throw new Error(
        `Failed to fetch user organizations with role: ${error.message}`,
      );

    return (data || []).map((uo) => ({
      ...uo.organization,
      role: uo.role,
    }));
  }

  /**
   * Check if user has access to organization
   */
  async hasAccessToOrganization(
    userId: string,
    organizationId: string,
  ): Promise<boolean> {
    const { data, error } = await this.supabase
      .from("user_organizations")
      .select("organization_id")
      .eq("user_id", userId)
      .eq("organization_id", organizationId)
      .single();

    if (error) {
      if (error.code === "PGRST116") return false;
      throw new Error(`Failed to check organization access: ${error.message}`);
    }
    return !!data;
  }

  /**
   * Get organization IDs where user is admin or owner
   */
  async getAdminOrganizations(userId: string): Promise<string[]> {
    const { data, error } = await this.supabase
      .from("user_organizations")
      .select("organization_id")
      .eq("user_id", userId)
      .in("role", ["admin", "owner"]);

    if (error)
      throw new Error(`Failed to fetch admin organizations: ${error.message}`);
    return (data || []).map((uo) => uo.organization_id);
  }

  /**
   * Get all memberships for organizations (with org details)
   */
  async getMembershipsForOrganizations(organizationIds: string[]) {
    if (organizationIds.length === 0) return [];

    const { data, error } = await this.supabase
      .from("user_organizations")
      .select(
        `
        *,
        organization:organizations(*)
      `,
      )
      .in("organization_id", organizationIds);

    if (error) throw new Error(`Failed to fetch memberships: ${error.message}`);
    return data || [];
  }

  /**
   * Check if user is admin or owner of organization
   */
  async isAdminOrOwner(
    userId: string,
    organizationId: string,
  ): Promise<boolean> {
    const { data, error } = await this.supabase
      .from("user_organizations")
      .select("role")
      .eq("user_id", userId)
      .eq("organization_id", organizationId)
      .in("role", ["admin", "owner"])
      .single();

    if (error) {
      if (error.code === "PGRST116") return false;
      throw new Error(`Failed to check admin role: ${error.message}`);
    }
    return !!data;
  }

  /**
   * Get membership by ID
   */
  async getMembershipById(membershipId: string) {
    const { data, error } = await this.supabase
      .from("user_organizations")
      .select("organization_id, user_id")
      .eq("id", membershipId)
      .single();

    if (error) {
      if (error.code === "PGRST116") return null;
      throw new Error(`Failed to fetch membership: ${error.message}`);
    }
    return data;
  }

  /**
   * Get user IDs for organization
   */
  async getUserIdsForOrganization(organizationId: string): Promise<string[]> {
    const { data, error } = await this.supabase
      .from("user_organizations")
      .select("user_id")
      .eq("organization_id", organizationId);

    if (error)
      throw new Error(`Failed to fetch organization members: ${error.message}`);
    return (data || []).map((m) => m.user_id);
  }

  /**
   * Check if user is owner of any organization
   */
  async isOwnerOfAnyOrganization(userId: string): Promise<boolean> {
    const { data, error } = await this.supabase
      .from("user_organizations")
      .select("id")
      .eq("user_id", userId)
      .eq("role", "owner")
      .limit(1);

    if (error)
      throw new Error(`Failed to check owner status: ${error.message}`);
    return (data?.length ?? 0) > 0;
  }
}
