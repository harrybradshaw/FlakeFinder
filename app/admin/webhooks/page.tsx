/**
 * Webhook Management Dashboard
 * Configure webhooks and monitor delivery status
 */

import { Suspense } from "react";
import { WebhooksList } from "@/components/webhooks/webhooks-list";
import { WebhookDeliveries } from "@/components/webhooks/webhook-deliveries";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import Link from "next/link";

export default async function WebhooksPage() {
  return (
    <div className="container mx-auto px-4 py-12 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Webhook Management</h1>
          <p className="text-muted-foreground mt-2">
            Configure notifications for test failures, flakiness alerts, and
            performance regressions
          </p>
        </div>
        <Link href="/admin/webhooks/new">
          <Button size="lg">
            <Plus className="h-4 w-4 mr-2" />
            Add Webhook
          </Button>
        </Link>
      </div>

      {/* Webhook Configurations */}
      <div className="space-y-4">
        <h2 className="text-2xl font-semibold">Configured Webhooks</h2>
        <Suspense fallback={<div>Loading webhooks...</div>}>
          <WebhooksList />
        </Suspense>
      </div>

      {/* Recent Deliveries */}
      <div className="space-y-4">
        <h2 className="text-2xl font-semibold">Recent Deliveries</h2>
        <Suspense fallback={<div>Loading deliveries...</div>}>
          <WebhookDeliveries />
        </Suspense>
      </div>
    </div>
  );
}
