import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { type Database } from "@/types/supabase";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: testResultId } = await params;

    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json(
        { error: "Storage not configured" },
        { status: 500 },
      );
    }

    const supabase = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    );

    // Get the steps URL from the database
    const { data: testResult, error } = await supabase
      .from("test_results")
      .select("steps_url")
      .eq("id", testResultId)
      .single();

    if (error || !testResult?.steps_url) {
      return NextResponse.json(
        { error: "Steps not found" },
        { status: 404 },
      );
    }

    // Download from storage
    const { data: stepsData, error: downloadError } = await supabase.storage
      .from("test-steps")
      .download(testResult.steps_url);

    if (downloadError) {
      console.error("[API] Error downloading steps:", downloadError);
      return NextResponse.json(
        { error: "Failed to load steps" },
        { status: 500 },
      );
    }

    // Parse JSON
    const stepsText = await stepsData.text();
    const steps = JSON.parse(stepsText);

    return NextResponse.json({ steps });
  } catch (error) {
    console.error("[API] Error in steps endpoint:", error);
    return NextResponse.json(
      { error: "Failed to fetch steps" },
      { status: 500 },
    );
  }
}
