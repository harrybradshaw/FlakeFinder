import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

export async function GET(request: NextRequest) {
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
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY,
    );

    const { data, error } = await supabase
      .from("test_triggers")
      .select("*")
      .eq("active", true)
      .order("name", { ascending: true });

    if (error) {
      console.error("[API] Error fetching triggers:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ triggers: data || [] });
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
