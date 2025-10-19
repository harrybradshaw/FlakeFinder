import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { cache } from "react";
import { createClient } from "@supabase/supabase-js";

// Cached function to get all active environments
const getActiveEnvironments = cache(async () => {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
    return { environments: [], error: null };
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY,
  );

  const { data, error } = await supabase
    .from("environments")
    .select("*")
    .eq("active", true)
    .order("name", { ascending: true });

  if (error) {
    return { environments: [], error };
  }

  return { environments: data || [], error: null };
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
      return NextResponse.json({ error: error.message }, { status: 500 });
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
