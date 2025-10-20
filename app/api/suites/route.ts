import { type NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
      console.log("[API] Supabase not configured");
      return NextResponse.json({ suites: [] });
    }

    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY,
    );

    // Get project_id from query params if provided
    const searchParams = request.nextUrl.searchParams;
    const projectId = searchParams.get("project_id");

    let query = supabase
      .from("suites")
      .select("id, name, description, project_id")
      .eq("active", true)
      .order("name", { ascending: true });

    // Filter by project if specified
    if (projectId) {
      query = query.eq("project_id", projectId);
    }

    const { data: suites, error } = await query;

    if (error) {
      console.error("[API] Error fetching suites:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ suites: suites || [] });
  } catch (error) {
    console.error("[API] Error in suites API:", error);
    return NextResponse.json(
      { error: "Failed to fetch suites" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
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

    const body = await request.json();
    const { name, description, project_id } = body;

    if (!name || !project_id) {
      return NextResponse.json(
        { error: "Name and project_id are required" },
        { status: 400 },
      );
    }

    // Insert new suite
    const { data: suite, error } = await supabase
      .from("suites")
      .insert({
        name,
        description: description || null,
        project_id,
      })
      .select()
      .single();

    if (error) {
      console.error("[API] Error creating suite:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ suite });
  } catch (error) {
    console.error("[API] Error in suites POST:", error);
    return NextResponse.json(
      { error: "Failed to create suite" },
      { status: 500 },
    );
  }
}
