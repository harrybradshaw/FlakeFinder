/**
 * Webhooks List Component
 * Displays configured webhooks with status and actions
 */

import { createClient } from "@supabase/supabase-js";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Settings, Trash2, Power, PowerOff } from "lucide-react";
import Link from "next/link";
import { type Database } from "@/types/supabase";
import { TestWebhookButton } from "./test-webhook-button";

export async function WebhooksList() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-destructive">Database not configured</p>
        </CardContent>
      </Card>
    );
  }

  const supabase = createClient<Database>(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY,
  );

  // Fetch webhooks with their triggers, organization, and project details
  // Note: After running migration 019, the duplicate FK is removed and we can use simpler syntax
  const { data: webhooks, error } = await supabase
    .from("webhook_configurations")
    .select(
      `
      *,
      webhook_triggers(*),
      organization:organizations(id, name, display_name),
      project:projects(id, name, display_name)
    `,
    )
    .order("created_at", { ascending: false });

  if (error) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-destructive">
            Error loading webhooks: {error.message}
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!webhooks || webhooks.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center py-8">
            <p className="text-muted-foreground mb-4">
              No webhooks configured yet
            </p>
            <Link href="/admin/webhooks/new">
              <Button>Add Your First Webhook</Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4">
      {webhooks.map((webhook: any) => (
        <Card key={webhook.id} className="overflow-hidden">
          <CardHeader className="pb-5 pt-6">
            <div className="flex items-start justify-between gap-6">
              <div className="flex-1 min-w-0 space-y-4">
                <div className="flex items-center gap-3 flex-wrap">
                  <CardTitle className="text-xl font-semibold">
                    {webhook.name}
                  </CardTitle>
                  <Badge
                    variant={webhook.enabled ? "default" : "secondary"}
                    className="flex items-center gap-1.5 px-2.5 py-0.5"
                  >
                    {webhook.enabled ? (
                      <>
                        <Power className="h-3 w-3" />
                        Enabled
                      </>
                    ) : (
                      <>
                        <PowerOff className="h-3 w-3" />
                        Disabled
                      </>
                    )}
                  </Badge>
                  <Badge variant="outline" className="capitalize px-2.5 py-0.5">
                    {webhook.webhook_type}
                  </Badge>
                </div>
                <div className="space-y-1.5">
                  <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                    Webhook URL
                  </span>
                  <code className="block text-xs bg-muted px-3 py-2 rounded-md font-mono break-all border">
                    {webhook.webhook_url}
                  </code>
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                <TestWebhookButton webhookId={webhook.id} />
                <Link href={`/admin/webhooks/${webhook.id}`}>
                  <Button variant="outline" size="sm" className="h-9 w-9 p-0">
                    <Settings className="h-4 w-4" />
                  </Button>
                </Link>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 w-9 p-0 text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0 pb-5">
            <div className="space-y-3">
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-3">
                  Triggers
                </p>
                <div className="flex flex-wrap gap-2">
                  {webhook.webhook_triggers &&
                  webhook.webhook_triggers.length > 0 ? (
                    webhook.webhook_triggers.map((trigger: any) => (
                      <Badge
                        key={trigger.id}
                        variant="secondary"
                        className="capitalize px-3 py-1"
                      >
                        {trigger.trigger_type.replace(/_/g, " ")}
                      </Badge>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground italic">
                      No triggers configured
                    </p>
                  )}
                </div>
              </div>
              <div className="pt-2 border-t">
                <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                  {webhook.project_id && webhook.project ? (
                    <>
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                      <span>
                        Project:{" "}
                        <span className="font-medium text-foreground">
                          {webhook.project.display_name || webhook.project.name}
                        </span>
                        {webhook.organization && (
                          <span className="ml-1">
                            in{" "}
                            {webhook.organization.display_name ||
                              webhook.organization.name}
                          </span>
                        )}
                      </span>
                    </>
                  ) : webhook.organization ? (
                    <>
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500"></span>
                      <span>
                        Organization:{" "}
                        <span className="font-medium text-foreground">
                          {webhook.organization.display_name ||
                            webhook.organization.name}
                        </span>
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-gray-500"></span>
                      <span>No organization/project specified</span>
                    </>
                  )}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
