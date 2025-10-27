import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { type Database } from "@/types/supabase";
import { createRepositories } from "@/lib/repositories";

export async function GET() {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json(
        { error: "User not authenticated" },
        { status: 401 },
      );
    }

    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 500 },
      );
    }

    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient<Database>(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY,
    );
    const repos = createRepositories(supabase);

    const userOrgIds = await repos.lookups.getUserOrganizations(userId);

    if (userOrgIds.length === 0) {
      return NextResponse.json({ relationships: [] });
    }

    const relationships =
      await repos.projects.getOrganizationProjectRelationships(userOrgIds);

    return NextResponse.json({ relationships });
  } catch (error) {
    console.error(
      "[API] Error fetching organization-project relationships:",
      error,
    );
    return NextResponse.json(
      {
        error: "Failed to fetch relationships",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

// POST - Link a project to an organization
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { organization_id, project_id } = body;

    if (!organization_id || !project_id) {
      return NextResponse.json(
        { error: "Missing required fields: organization_id, project_id" },
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

    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 500 },
      );
    }

    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient<Database>(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY,
    );
    const repos = createRepositories(supabase);

    // Insert the relationship
    const relationship =
      await repos.projects.createOrganizationProjectRelationship(
        organization_id,
        project_id,
      );

    return NextResponse.json({ relationship });
  } catch (error) {
    console.error("[API] Error creating relationship:", error);
    return NextResponse.json(
      {
        error: "Failed to create relationship",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

// DELETE - Remove a project from an organization
export async function DELETE(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const relationshipId = searchParams.get("id");

    if (!relationshipId) {
      return NextResponse.json(
        { error: "Missing required parameter: id" },
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

    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 500 },
      );
    }

    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient<Database>(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY,
    );
    const repos = createRepositories(supabase);

    // Delete the relationship
    await repos.projects.deleteOrganizationProjectRelationship(relationshipId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[API] Error deleting relationship:", error);
    return NextResponse.json(
      {
        error: "Failed to delete relationship",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
