import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { type Database } from "@/types/supabase";
import { createRepositories } from "@/lib/repositories";

export async function GET(_request: NextRequest) {
  try {
    // Verify authentication (middleware enforces this, but good practice to check)
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
      return NextResponse.json({ triggers: [] });
    }

    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient<Database>(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY,
    );
    const repos = createRepositories(supabase);

    const triggers = await repos.lookups.getActiveTriggers();

    return NextResponse.json({ triggers });
  } catch (error) {
    console.error("[API] Error fetching triggers:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch triggers",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
