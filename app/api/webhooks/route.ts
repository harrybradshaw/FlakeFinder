/**
 * Webhook Configuration API
 * Handles CRUD operations for webhook configurations
 */

import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";
import { type Database } from "@/types/supabase";
import { createRepositories } from "@/lib/repositories";

export async function POST(request: NextRequest) {
  try {
    // Get user authentication
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 500 },
      );
    }

    const supabase = createClient<Database>(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY,
    );
    const repos = createRepositories(supabase);

    const body = await request.json();
    const {
      name,
      webhookType,
      webhookUrl,
      secretKey,
      enabled,
      triggers,
      organizationId,
      projectId,
    } = body;

    // Validate required fields
    if (
      !name ||
      !webhookType ||
      !webhookUrl ||
      !triggers ||
      triggers.length === 0
    ) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    if (!organizationId) {
      return NextResponse.json(
        { error: "Organization ID is required" },
        { status: 400 },
      );
    }

    // Verify user has access to this organization
    const hasAccess = await repos.organizations.hasAccessToOrganization(
      userId,
      organizationId,
    );

    if (!hasAccess) {
      return NextResponse.json(
        { error: "You do not have access to this organization" },
        { status: 403 },
      );
    }

    // Create webhook configuration
    const webhook = await repos.webhooks.createWebhook({
      organization_id: organizationId,
      project_id: projectId || null, // null means all projects in org
      name,
      webhook_type: webhookType,
      webhook_url: webhookUrl,
      secret_key: secretKey || null,
      enabled: enabled ?? true,
      created_by: userId,
    });

    // Create webhook triggers
    try {
      await repos.webhooks.createWebhookTriggers(webhook.id, triggers);
    } catch (triggersError) {
      console.error("Error creating triggers:", triggersError);
      // Rollback webhook creation
      try {
        await repos.webhooks.deleteWebhook(webhook.id);
      } catch (deleteError) {
        console.error("Failed to rollback webhook creation:", deleteError);
      }
      throw triggersError;
    }

    return NextResponse.json({ webhook }, { status: 201 });
  } catch (error) {
    console.error("Error in webhook creation:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function GET(_request: NextRequest) {
  try {
    // Get user authentication
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 500 },
      );
    }

    const supabase = createClient<Database>(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY,
    );
    const repos = createRepositories(supabase);

    // Get user's organizations
    const orgIds = await repos.lookups.getUserOrganizations(userId);

    if (orgIds.length === 0) {
      return NextResponse.json({ webhooks: [] });
    }

    // Fetch webhooks for user's organizations
    const webhooks = await repos.webhooks.getWebhooksForOrganizations(orgIds);

    return NextResponse.json({ webhooks });
  } catch (error) {
    console.error("Error in webhook fetch:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
