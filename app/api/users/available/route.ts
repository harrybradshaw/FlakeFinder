/**
 * Available Users API
 * Get all Clerk users who are not members of the specified organization
 */

import { type NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";
import { type Database } from "@/types/supabase";
import { createRepositories } from "@/lib/repositories";

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 500 },
      );
    }

    const body = await request.json();
    const { organizationId } = body;

    if (!organizationId) {
      return NextResponse.json(
        { error: "Organization ID is required" },
        { status: 400 },
      );
    }

    // Get all Clerk users with proper pagination
    console.log("Starting Clerk API call...");
    const clerk = await clerkClient();
    console.log("Clerk client initialized");

    // Fetch all users by handling pagination
    let allUsers: any[] = [];
    let offset = 0;
    const limit = 100;
    let hasMore = true;
    let iteration = 0;

    while (hasMore) {
      iteration++;
      console.log(
        `Fetching batch ${iteration} (offset: ${offset}, limit: ${limit})`,
      );

      try {
        const response = await clerk.users.getUserList({
          limit,
          offset,
        });

        console.log(`Batch ${iteration} response:`, {
          dataLength: response.data.length,
          totalCount: response.totalCount,
        });

        allUsers = allUsers.concat(response.data);
        offset += limit;
        hasMore = response.data.length === limit;

        // Safety check to prevent infinite loops
        if (offset > 1000) {
          console.log("Safety limit reached, stopping pagination");
          break;
        }
      } catch (error) {
        console.error(`Error fetching batch ${iteration}:`, error);
        throw error;
      }
    }

    console.log("Clerk API response:", {
      totalFetched: allUsers.length,
      firstUser: allUsers[0]
        ? {
            id: allUsers[0].id,
            firstName: allUsers[0].firstName,
            lastName: allUsers[0].lastName,
            email: allUsers[0].emailAddresses[0]?.emailAddress,
          }
        : null,
      allUserIds: allUsers.map((u) => u.id),
    });

    // Get existing members of the organization
    const supabase = createClient<Database>(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY,
    );
    const repos = createRepositories(supabase);

    const existingUserIds = new Set(
      await repos.organizations.getUserIdsForOrganization(organizationId),
    );

    console.log("Organization ID:", organizationId);
    console.log("Existing member count:", existingUserIds.size);
    console.log("Total Clerk users:", allUsers.length);

    // Filter out users who are already members of THIS organization
    const availableUsers = allUsers
      .filter((user: any) => !existingUserIds.has(user.id))
      .map((user: any) => ({
        id: user.id,
        email: user.emailAddresses[0]?.emailAddress || "No email",
        name:
          `${user.firstName || ""} ${user.lastName || ""}`.trim() ||
          "Unknown User",
        imageUrl: user.imageUrl,
      }));

    console.log("Available users:", availableUsers.length);

    return NextResponse.json({ users: availableUsers });
  } catch (_error) {
    console.error("Available users error:", _error);
    return NextResponse.json(
      { error: "Failed to fetch available users" },
      { status: 500 },
    );
  }
}
