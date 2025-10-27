import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { cache } from "react";
import { createClient } from "@supabase/supabase-js";
import { type Database } from "@/types/supabase";
import { createRepositories } from "@/lib/repositories";

// export const dynamic = "force-static";

const getActiveEnvironments = cache(async () => {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
    return { environments: [], error: null };
  }

  const supabase = createClient<Database>(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY,
  );
  const repos = createRepositories(supabase);

  try {
    const environments = await repos.lookups.getActiveEnvironments();
    return { environments, error: null };
  } catch (error) {
    return { environments: [], error };
  }
});

export async function GET(_request: NextRequest) {
  try {
    // Verify authentication (middleware enforces this, but good practice to check)
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
      return NextResponse.json({ environments: [] });
    }

    // Get active environments (cached)
    const { environments, error } = await getActiveEnvironments();

    if (error) {
      console.error("[API] Error fetching environments:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Failed to fetch environments";
      return NextResponse.json({ error: errorMessage }, { status: 500 });
    }

    return NextResponse.json({ environments });
  } catch (error) {
    console.error("[API] Error fetching environments:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch environments",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
