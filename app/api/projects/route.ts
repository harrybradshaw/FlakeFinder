import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { cache } from "react";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { createRepositories } from "@/lib/repositories";

const getUserOrganizations = cache(
  async (userId: string): Promise<{ userOrgIds: string[]; error: unknown }> => {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
      return { userOrgIds: [], error: null };
    }

    const supabase = createClient<Database>(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY,
    );
    const repos = createRepositories(supabase);

    try {
      const userOrgIds = await repos.lookups.getUserOrganizations(userId);
      return { userOrgIds, error: null };
    } catch (error) {
      return { userOrgIds: [], error };
    }
  },
);

const getOrganizationProjects = cache(async (userOrgIds: string[]) => {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
    return { projectIds: [], error: null };
  }

  const supabase = createClient<Database>(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY,
  );
  const repos = createRepositories(supabase);

  try {
    const projectIds = await repos.lookups.getAccessibleProjectIds(userOrgIds);
    return { projectIds, error: null };
  } catch (error) {
    return { projectIds: [], error };
  }
});

const getProjectDetails = cache(async (projectIds: string[]) => {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
    return { projects: [], error: null };
  }

  const supabase = createClient<Database>(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY,
  );
  const repos = createRepositories(supabase);

  try {
    const projects = await repos.projects.getProjectsByIds(projectIds, true);
    return { projects, error: null };
  } catch (error) {
    return { projects: [], error };
  }
});

export async function GET(request: NextRequest) {
  try {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
      return NextResponse.json({ projects: [] });
    }

    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ projects: [] });
    }

    const searchParams = request.nextUrl.searchParams;
    const organizationId = searchParams.get("organizationId");

    const { userOrgIds, error: userOrgsError } =
      await getUserOrganizations(userId);

    if (userOrgsError) {
      console.error("[API] Error fetching user organizations:", userOrgsError);
      const errorMessage =
        userOrgsError instanceof Error
          ? userOrgsError.message
          : "Failed to fetch user organizations";
      return NextResponse.json({ error: errorMessage }, { status: 500 });
    }

    if (userOrgIds.length === 0) {
      console.log("[API] User has no organization memberships");
      return NextResponse.json({ projects: [] });
    }

    let targetOrgIds = userOrgIds;
    if (organizationId) {
      if (!userOrgIds.includes(organizationId)) {
        console.log(
          "[API] User does not have access to specified organization",
        );
        return NextResponse.json({ projects: [] });
      }
      targetOrgIds = [organizationId];
      console.log("[API] Filtering projects for organization:", organizationId);
    }

    const { projectIds, error: orgProjectsError } =
      await getOrganizationProjects(targetOrgIds);

    if (orgProjectsError) {
      console.error(
        "[API] Error fetching organization projects:",
        orgProjectsError,
      );
      const errorMessage =
        orgProjectsError instanceof Error
          ? orgProjectsError.message
          : "Failed to fetch organization projects";
      return NextResponse.json({ error: errorMessage }, { status: 500 });
    }

    if (projectIds.length === 0) {
      return NextResponse.json({ projects: [] });
    }

    const { projects, error } = await getProjectDetails(projectIds);

    if (error) {
      console.error("[API] Error fetching project details:", error);
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Failed to fetch project details";
      return NextResponse.json({ error: errorMessage }, { status: 500 });
    }

    return NextResponse.json({ projects });
  } catch (error) {
    console.error("[API] Error fetching projects:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch projects",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, display_name, description, color, organization_id } = body;

    if (!name || !display_name) {
      return NextResponse.json(
        { error: "Missing required fields: name, display_name" },
        { status: 400 },
      );
    }

    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json(
        { error: "User not authenticated" },
        { status: 401 },
      );
    }

    if (!organization_id) {
      return NextResponse.json(
        { error: "Missing required field: organization_id" },
        { status: 400 },
      );
    }

    const targetOrgId = organization_id;

    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 500 },
      );
    }

    const supabase = createClient<Database>(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY,
    );
    const repos = createRepositories(supabase);

    const project = await repos.projects.createProject({
      name,
      display_name,
      description,
      color: color || "#3b82f6",
      active: true,
    });

    try {
      await repos.projects.linkProjectToOrganization(project.id, targetOrgId);
    } catch (linkError) {
      console.error("[API] Failed to link project to organization:", linkError);
      // Roll back the project creation
      try {
        await repos.projects.deleteProject(project.id);
      } catch (deleteError) {
        console.error(
          "[API] Failed to roll back project creation:",
          deleteError,
        );
      }
      throw linkError;
    }

    return NextResponse.json({ project });
  } catch (error) {
    console.error("[API] Error creating project:", error);
    return NextResponse.json(
      {
        error: "Failed to create project",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
