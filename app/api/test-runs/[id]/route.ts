import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getTestRun } from "@/lib/test-runs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    // Get user authentication
    const { userId } = await auth();

    if (!userId) {
      console.log("[API] User not authenticated");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Use shared function to fetch test run
    const testRun = await getTestRun(id, userId);

    if (!testRun) {
      return NextResponse.json(
        { error: "Test run not found" },
        { status: 404 },
      );
    }

    return NextResponse.json(testRun);
  } catch (error) {
    console.error("[API] Error fetching test run:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch test run",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
