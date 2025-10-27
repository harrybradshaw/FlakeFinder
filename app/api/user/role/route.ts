/**
 * User Role API
 * Check if the current user is an owner of any organization
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

    // Check if user is an owner of any organization
    const isOwner = await repos.organizations.isOwnerOfAnyOrganization(userId);

    return NextResponse.json({ isOwner });
  } catch (_error) {
    console.error("User role check error:", _error);
    return NextResponse.json(
      { error: "Failed to check user role" },
      { status: 500 },
    );
  }
}
