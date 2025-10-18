import { type NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  try {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
      return NextResponse.json({ environments: [] })
    }

    const { createClient } = await import("@supabase/supabase-js")
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY)

    const { data, error } = await supabase
      .from("environments")
      .select("*")
      .eq("active", true)
      .order("name", { ascending: true })

    if (error) {
      console.error("[API] Error fetching environments:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ environments: data || [] })
  } catch (error) {
    console.error("[API] Error fetching environments:", error)
    return NextResponse.json(
      {
        error: "Failed to fetch environments",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    )
  }
}
