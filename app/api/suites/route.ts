import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { type Database } from "@/types/supabase";
import { createRepositories } from "@/lib/repositories";

export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ suites: [] });
    }

    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
      console.log("[API] Supabase not configured");
      return NextResponse.json({ suites: [] });
    }

    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient<Database>(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY,
    );
    const repos = createRepositories(supabase);

    // Get user's organizations
    const organizationIds = await repos.lookups.getUserOrganizations(userId);

    if (organizationIds.length === 0) {
      return NextResponse.json({ suites: [] });
    }

    // Get projects accessible to user's organizations
    const accessibleProjectIds =
      await repos.lookups.getAccessibleProjectIds(organizationIds);

    if (accessibleProjectIds.length === 0) {
      return NextResponse.json({ suites: [] });
    }

    // Get project_id from query params if provided
    const searchParams = request.nextUrl.searchParams;
    const projectId = searchParams.get("project_id");

    // Get suites for accessible projects
    const suites = await repos.lookups.getSuitesForProjects(
      accessibleProjectIds,
      projectId,
    );

    return NextResponse.json({ suites });
  } catch (error) {
    console.error("[API] Error in suites API:", error);
    return NextResponse.json(
      { error: "Failed to fetch suites" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
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

    const body = await request.json();
    const { name, description, project_id } = body;

    if (!name || !project_id) {
      return NextResponse.json(
        { error: "Name and project_id are required" },
        { status: 400 },
      );
    }

    // Insert new suite
    const suite = await repos.lookups.createSuite({
      name,
      description: description || null,
      project_id,
    });

    return NextResponse.json({ suite });
  } catch (error) {
    console.error("[API] Error in suites POST:", error);
    return NextResponse.json(
      { error: "Failed to create suite" },
      { status: 500 },
    );
  }
}
