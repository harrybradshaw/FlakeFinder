import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { cache } from "react";
import { createClient } from "@supabase/supabase-js";
import { type Database } from "@/types/supabase";
import { createRepositories } from "@/lib/repositories";

// Cached function to get user's organizations with details
const getUserOrganizationsWithDetails = cache(async (userId: string) => {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
    return { organizations: [], error: null };
  }

  const supabase = createClient<Database>(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY,
  );
  const repos = createRepositories(supabase);

  try {
    const organizations =
      await repos.organizations.getOrganizationsWithRole(userId);
    return { organizations, error: null };
  } catch (error) {
    return { organizations: [], error };
  }
});

// GET - List all organizations the user belongs to
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

    // Get user's organization memberships (cached)
    const { organizations, error: userOrgsError } =
      await getUserOrganizationsWithDetails(userId);

    if (userOrgsError) {
      console.error("[API] Error fetching user organizations:", userOrgsError);
      const errorMessage =
        userOrgsError instanceof Error
          ? userOrgsError.message
          : "Failed to fetch user organizations";
      return NextResponse.json({ error: errorMessage }, { status: 500 });
    }

    return NextResponse.json({ organizations });
  } catch (error) {
    console.error("[API] Error fetching organizations:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch organizations",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

// POST - Create a new organization
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, display_name, description } = body;

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

    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 500 },
      );
    }

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY,
    );
    const repos = createRepositories(supabase);

    // Create the organization
    const orgData = await repos.organizations.createOrganization({
      name,
      display_name,
      description,
      active: true,
    });

    // Add the creating user as an owner
    try {
      await repos.organizations.addMember(orgData.id, userId, "owner");
    } catch (memberError) {
      console.error("[API] Failed to add user to organization:", memberError);
      // Rollback organization creation
      try {
        await repos.organizations.deleteOrganization(orgData.id);
      } catch (deleteError) {
        console.error(
          "[API] Failed to roll back organization creation:",
          deleteError,
        );
      }
      throw memberError;
    }

    return NextResponse.json({ organization: orgData });
  } catch (error) {
    console.error("[API] Error creating organization:", error);
    return NextResponse.json(
      {
        error: "Failed to create organization",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
