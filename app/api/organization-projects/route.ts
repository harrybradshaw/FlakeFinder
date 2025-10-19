import { type NextRequest, NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"

// GET - List all organization-project relationships for user's organizations
export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth()
    
    if (!userId) {
      return NextResponse.json(
        { error: "User not authenticated" },
        { status: 401 },
      )
    }

    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 500 },
      )
    }

    const { createClient } = await import("@supabase/supabase-js")
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY)

    // Get user's organization memberships
    const { clerkClient } = await import("@clerk/nextjs/server")
    const client = await clerkClient()
    const orgMemberships = await client.users.getOrganizationMembershipList({
      userId: userId,
    })
    
    const userOrgIds = orgMemberships.data.map((membership) => membership.organization.id)
    
    if (userOrgIds.length === 0) {
      return NextResponse.json({ relationships: [] })
    }

    // Fetch organization-project relationships
    const { data, error } = await supabase
      .from("organization_projects")
      .select(`
        *,
        project:projects(*)
      `)
      .in("organization_id", userOrgIds)

    if (error) {
      console.error("[API] Error fetching organization-project relationships:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ relationships: data || [] })
  } catch (error) {
    console.error("[API] Error fetching organization-project relationships:", error)
    return NextResponse.json(
      {
        error: "Failed to fetch relationships",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}

// POST - Link a project to an organization
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { organization_id, project_id } = body

    if (!organization_id || !project_id) {
      return NextResponse.json(
        { error: "Missing required fields: organization_id, project_id" },
        { status: 400 },
      )
    }

    const { userId } = await auth()
    
    if (!userId) {
      return NextResponse.json(
        { error: "User not authenticated" },
        { status: 401 },
      )
    }

    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 500 },
      )
    }

    const { createClient } = await import("@supabase/supabase-js")
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY)

    // Insert the relationship
    const { data, error } = await supabase
      .from("organization_projects")
      .insert({
        organization_id,
        project_id,
      })
      .select()
      .single()

    if (error) {
      console.error("[API] Failed to create relationship:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ relationship: data })
  } catch (error) {
    console.error("[API] Error creating relationship:", error)
    return NextResponse.json(
      {
        error: "Failed to create relationship",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}

// DELETE - Remove a project from an organization
export async function DELETE(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const relationshipId = searchParams.get("id")

    if (!relationshipId) {
      return NextResponse.json(
        { error: "Missing required parameter: id" },
        { status: 400 },
      )
    }

    const { userId } = await auth()
    
    if (!userId) {
      return NextResponse.json(
        { error: "User not authenticated" },
        { status: 401 },
      )
    }

    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 500 },
      )
    }

    const { createClient } = await import("@supabase/supabase-js")
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY)

    // Delete the relationship
    const { error } = await supabase
      .from("organization_projects")
      .delete()
      .eq("id", relationshipId)

    if (error) {
      console.error("[API] Failed to delete relationship:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[API] Error deleting relationship:", error)
    return NextResponse.json(
      {
        error: "Failed to delete relationship",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}
