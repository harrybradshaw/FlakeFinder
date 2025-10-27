/**
 * User Organizations API
 * Get organizations that the current user is a member of
 */

import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";
import { type Database } from "@/types/supabase";
import { createRepositories } from "@/lib/repositories";

export async function GET(_request: NextRequest) {
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

    const supabase = createClient<Database>(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY,
    );
    const repos = createRepositories(supabase);

    // Get user's organizations with role
    const orgsWithRole =
      await repos.organizations.getOrganizationsWithRole(userId);

    const organizations = orgsWithRole.map((org: any) => ({
      id: org.id,
      name: org.name,
      role: org.role,
    }));

    return NextResponse.json({ organizations });
  } catch (_error) {
    console.error("User organizations error:", _error);
    return NextResponse.json(
      { error: "Failed to fetch user organizations" },
      { status: 500 },
    );
  }
}
