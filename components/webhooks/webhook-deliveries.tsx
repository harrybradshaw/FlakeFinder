/**
 * Webhook Deliveries Component
 * Shows recent webhook delivery attempts and their status
 */

import { createClient } from "@supabase/supabase-js";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, Clock, RefreshCw } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { type Database } from "@/types/supabase";

export async function WebhookDeliveries(): Promise<React.JSX.Element> {
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

  // Fetch recent deliveries
  const { data: deliveries, error } = await supabase
    .from("webhook_deliveries")
    .select(
      `
      *,
      webhook_configurations(name, webhook_type),
      webhook_triggers(trigger_type)
    `,
    )
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-destructive">
            Error loading deliveries: {error.message}
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!deliveries || deliveries.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-center text-muted-foreground py-8">
            No webhook deliveries yet
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="space-y-4">
          {deliveries.map((delivery: any) => {
            const StatusIcon =
              delivery.status === "delivered"
                ? CheckCircle2
                : delivery.status === "failed"
                  ? XCircle
                  : delivery.status === "retrying"
                    ? RefreshCw
                    : Clock;

            const statusColor =
              delivery.status === "delivered"
                ? "text-green-600"
                : delivery.status === "failed"
                  ? "text-red-600"
                  : delivery.status === "retrying"
                    ? "text-yellow-600"
                    : "text-gray-600";

            return (
              <div
                key={delivery.id}
                className="flex items-start justify-between border-b pb-4 last:border-0"
              >
                <div className="flex items-start gap-3 flex-1">
                  <StatusIcon className={`h-5 w-5 mt-0.5 ${statusColor}`} />
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium">
                        {delivery.webhook_configurations?.name ||
                          "Unknown Webhook"}
                      </p>
                      <Badge variant="outline" className="text-xs">
                        {delivery.webhook_triggers?.trigger_type?.replace(
                          /_/g,
                          " ",
                        ) || "unknown"}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {formatDistanceToNow(new Date(delivery.created_at), {
                        addSuffix: true,
                      })}
                    </p>
                    {delivery.error_message && (
                      <p className="text-xs text-destructive mt-1">
                        {delivery.error_message}
                      </p>
                    )}
                    {delivery.response_code && (
                      <p className="text-xs text-muted-foreground">
                        HTTP {delivery.response_code}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <Badge
                    variant={
                      delivery.status === "delivered"
                        ? "default"
                        : delivery.status === "failed"
                          ? "destructive"
                          : delivery.status === "retrying"
                            ? "secondary"
                            : "outline"
                    }
                  >
                    {delivery.status}
                  </Badge>
                  {delivery.attempt_count > 0 && (
                    <p className="text-xs text-muted-foreground">
                      Attempt {delivery.attempt_count}/{delivery.max_attempts}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
