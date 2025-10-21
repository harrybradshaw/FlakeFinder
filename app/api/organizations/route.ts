import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { cache } from "react";
import { createClient } from "@supabase/supabase-js";
import { type Database } from "@/types/supabase";

// Cached function to get user's organizations with details
const getUserOrganizationsWithDetails = cache(async (userId: string) => {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
    return { organizations: [], error: null };
  }

  const supabase = createClient<Database>(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY,
  );

  const { data: userOrgs, error: userOrgsError } = await supabase
    .from("user_organizations")
    .select(
      `
        *,
        organization:organizations(*)
      `,
    )
    .eq("user_id", userId);

  if (userOrgsError) {
    return { organizations: [], error: userOrgsError };
  }

  const organizations =
    userOrgs?.map((uo) => ({
      ...uo.organization,
      role: uo.role,
    })) || [];

  return { organizations, error: null };
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
      return NextResponse.json(
        { error: userOrgsError.message },
        { status: 500 },
      );
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

    // Create the organization
    const { data: orgData, error: orgError } = await supabase
      .from("organizations")
      .insert({
        name,
        display_name,
        description,
        active: true,
      })
      .select()
      .single();

    if (orgError) {
      console.error("[API] Failed to create organization:", orgError);
      return NextResponse.json({ error: orgError.message }, { status: 500 });
    }

    // Add the creating user as an owner
    const { error: memberError } = await supabase
      .from("user_organizations")
      .insert({
        user_id: userId,
        organization_id: orgData.id,
        role: "owner",
      });

    if (memberError) {
      console.error("[API] Failed to add user to organization:", memberError);
      // Rollback organization creation
      await supabase.from("organizations").delete().eq("id", orgData.id);
      return NextResponse.json({ error: memberError.message }, { status: 500 });
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
