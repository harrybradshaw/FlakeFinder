import { type NextRequest, NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"

export async function GET(request: NextRequest) {
  try {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
      console.log("[API] Supabase not configured, returning empty array")
      return NextResponse.json({ projects: [] })
    }

    // Get user's organization memberships from Clerk
    const { userId, orgId, orgSlug } = await auth()
    
    if (!userId) {
      console.log("[API] User not authenticated")
      return NextResponse.json({ projects: [] })
    }

    const { createClient } = await import("@supabase/supabase-js")
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY)

    // Get all organization memberships for this user
    const { clerkClient } = await import("@clerk/nextjs/server")
    const client = await clerkClient()
    const orgMemberships = await client.users.getOrganizationMembershipList({
      userId: userId,
    })
    
    const userOrgIds = orgMemberships.data.map((membership) => membership.organization.id)
    
    console.log("[API] User organizations:", userOrgIds)
    
    if (userOrgIds.length === 0) {
      console.log("[API] User has no organization memberships")
      return NextResponse.json({ projects: [] })
    }

    // Query projects that belong to user's organizations
    const { data: orgProjects, error: orgProjectsError } = await supabase
      .from("organization_projects")
      .select("project_id, organization_id")
      .in("organization_id", userOrgIds)

    console.log("[API] Organization projects query result:", { data: orgProjects, error: orgProjectsError, userOrgIds })

    if (orgProjectsError) {
      console.error("[API] Error fetching organization projects:", orgProjectsError)
      return NextResponse.json({ error: orgProjectsError.message }, { status: 500 })
    }

    const projectIds = orgProjects?.map((op) => op.project_id) || []
    
    console.log("[API] Project IDs from organization_projects:", projectIds)
    
    if (projectIds.length === 0) {
      console.log("[API] No projects found for user's organizations")
      return NextResponse.json({ projects: [] })
    }

    // Fetch the actual project details
    const { data, error } = await supabase
      .from("projects")
      .select("*")
      .in("id", projectIds)
      .eq("active", true)
      .order("name", { ascending: true })

    if (error) {
      console.error("[API] Supabase error:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ projects: data || [] })
  } catch (error) {
    console.error("[API] Error fetching projects:", error)
    return NextResponse.json(
      {
        error: "Failed to fetch projects",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, display_name, description, color, organization_id } = body

    if (!name || !display_name) {
      return NextResponse.json(
        { error: "Missing required fields: name, display_name" },
        { status: 400 },
      )
    }

    // Get user's current organization
    const { userId, orgId } = await auth()
    
    if (!userId) {
      return NextResponse.json(
        { error: "User not authenticated" },
        { status: 401 },
      )
    }

    // Use provided organization_id or fall back to user's current org
    const targetOrgId = organization_id || orgId
    
    if (!targetOrgId) {
      return NextResponse.json(
        { error: "No organization specified. User must be in an organization or provide organization_id" },
        { status: 400 },
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

    // Create the project
    const { data, error } = await supabase
      .from("projects")
      .insert({
        name,
        display_name,
        description,
        color: color || '#3b82f6',
        active: true,
      })
      .select()
      .single()

    if (error) {
      console.error("[API] Failed to create project:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Link the project to the organization
    const { error: linkError } = await supabase
      .from("organization_projects")
      .insert({
        organization_id: targetOrgId,
        project_id: data.id,
      })

    if (linkError) {
      console.error("[API] Failed to link project to organization:", linkError)
      // Optionally: roll back the project creation
      await supabase.from("projects").delete().eq("id", data.id)
      return NextResponse.json({ error: linkError.message }, { status: 500 })
    }

    return NextResponse.json({ project: data })
  } catch (error) {
    console.error("[API] Error creating project:", error)
    return NextResponse.json(
      {
        error: "Failed to create project",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}
