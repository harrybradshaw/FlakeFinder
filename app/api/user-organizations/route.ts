import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { type Database } from "@/types/supabase";
import { createRepositories } from "@/lib/repositories";

export async function GET(_request: NextRequest) {
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

    // Get organizations the user is an admin/owner of
    const adminOrgIds = await repos.organizations.getAdminOrganizations(userId);

    if (adminOrgIds.length === 0) {
      return NextResponse.json({ memberships: [] });
    }

    // Fetch all user-organization relationships for organizations user can manage
    const memberships =
      await repos.organizations.getMembershipsForOrganizations(adminOrgIds);

    return NextResponse.json({ memberships });
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
    const supabase = createClient<Database>(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY,
    );
    const repos = createRepositories(supabase);

    const isAdmin = await repos.organizations.isAdminOrOwner(
      userId,
      organization_id,
    );

    if (!isAdmin) {
      return NextResponse.json(
        {
          error:
            "You must be an admin or owner to add users to this organization",
        },
        { status: 403 },
      );
    }

    await repos.organizations.addMember(
      organization_id,
      user_id,
      role || "member",
    );

    const memberships =
      await repos.organizations.getMembershipsForOrganizations([
        organization_id,
      ]);
    const membership = memberships.find((m) => m.user_id === user_id);

    return NextResponse.json({ membership });
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

    // Support both query param (id) and body-based (organizationId + userId) deletion
    const searchParams = request.nextUrl.searchParams;
    const membershipId = searchParams.get("id");

    let targetOrgId: string;
    let targetUserId: string;

    if (membershipId) {
      // Query param based deletion (original method)
      const membership =
        await repos.organizations.getMembershipById(membershipId);

      if (!membership) {
        return NextResponse.json(
          { error: "Membership not found" },
          { status: 404 },
        );
      }

      targetOrgId = membership.organization_id;
      targetUserId = membership.user_id;
    } else {
      // Body-based deletion (for backward compatibility with /api/organizations/members)
      const body = await request.json();
      const { organizationId, userId: memberUserId } = body;

      if (!organizationId || !memberUserId) {
        return NextResponse.json(
          {
            error:
              "Missing required parameters: organizationId and userId, or id",
          },
          { status: 400 },
        );
      }

      targetOrgId = organizationId;
      targetUserId = memberUserId;
    }

    // Prevent removing yourself
    if (targetUserId === userId) {
      return NextResponse.json(
        { error: "You cannot remove yourself from the organization" },
        { status: 400 },
      );
    }

    // Verify requesting user is an admin/owner of the organization
    const isAdmin = await repos.organizations.isAdminOrOwner(
      userId,
      targetOrgId,
    );

    if (!isAdmin) {
      return NextResponse.json(
        {
          error:
            "You must be an admin or owner to remove users from this organization",
        },
        { status: 403 },
      );
    }

    // Delete the membership
    await repos.organizations.removeMember(targetOrgId, targetUserId);

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
