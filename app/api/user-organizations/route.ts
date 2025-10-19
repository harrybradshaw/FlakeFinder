import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

// GET - List user-organization relationships for user's organizations
export async function GET(request: NextRequest) {
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
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY,
    );

    // Get organizations the user is an admin/owner of
    const { data: userOrgs, error: userOrgsError } = await supabase
      .from("user_organizations")
      .select("organization_id, role")
      .eq("user_id", userId)
      .in("role", ["admin", "owner"]);

    if (userOrgsError) {
      console.error("[API] Error fetching user organizations:", userOrgsError);
      return NextResponse.json(
        { error: userOrgsError.message },
        { status: 500 },
      );
    }

    const adminOrgIds = userOrgs?.map((uo) => uo.organization_id) || [];

    if (adminOrgIds.length === 0) {
      return NextResponse.json({ memberships: [] });
    }

    // Fetch all user-organization relationships for organizations user can manage
    const { data, error } = await supabase
      .from("user_organizations")
      .select(
        `
        *,
        organization:organizations(*)
      `,
      )
      .in("organization_id", adminOrgIds);

    if (error) {
      console.error("[API] Error fetching memberships:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ memberships: data || [] });
  } catch (error) {
    console.error("[API] Error fetching memberships:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch memberships",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

// POST - Add a user to an organization
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { user_id, organization_id, role } = body;

    if (!user_id || !organization_id) {
      return NextResponse.json(
        { error: "Missing required fields: user_id, organization_id" },
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
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY,
    );

    // Verify requesting user is an admin/owner of the organization
    const { data: userRole, error: roleError } = await supabase
      .from("user_organizations")
      .select("role")
      .eq("user_id", userId)
      .eq("organization_id", organization_id)
      .in("role", ["admin", "owner"])
      .single();

    if (roleError || !userRole) {
      return NextResponse.json(
        {
          error:
            "You must be an admin or owner to add users to this organization",
        },
        { status: 403 },
      );
    }

    // Add the user to the organization
    const { data, error } = await supabase
      .from("user_organizations")
      .insert({
        user_id,
        organization_id,
        role: role || "member",
      })
      .select()
      .single();

    if (error) {
      console.error("[API] Failed to add user to organization:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ membership: data });
  } catch (error) {
    console.error("[API] Error adding user to organization:", error);
    return NextResponse.json(
      {
        error: "Failed to add user to organization",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

// DELETE - Remove a user from an organization
export async function DELETE(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const membershipId = searchParams.get("id");

    if (!membershipId) {
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
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY,
    );

    // Get the membership details
    const { data: membership, error: fetchError } = await supabase
      .from("user_organizations")
      .select("organization_id")
      .eq("id", membershipId)
      .single();

    if (fetchError || !membership) {
      return NextResponse.json(
        { error: "Membership not found" },
        { status: 404 },
      );
    }

    // Verify requesting user is an admin/owner of the organization
    const { data: userRole, error: roleError } = await supabase
      .from("user_organizations")
      .select("role")
      .eq("user_id", userId)
      .eq("organization_id", membership.organization_id)
      .in("role", ["admin", "owner"])
      .single();

    if (roleError || !userRole) {
      return NextResponse.json(
        {
          error:
            "You must be an admin or owner to remove users from this organization",
        },
        { status: 403 },
      );
    }

    // Delete the membership
    const { error } = await supabase
      .from("user_organizations")
      .delete()
      .eq("id", membershipId);

    if (error) {
      console.error("[API] Failed to delete membership:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[API] Error deleting membership:", error);
    return NextResponse.json(
      {
        error: "Failed to delete membership",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
