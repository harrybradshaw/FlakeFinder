/**
 * New Webhook Configuration Page
 * Form to create a new webhook endpoint
 */

import { WebhookForm } from "@/components/webhooks/webhook-form";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function NewWebhookPage() {
  return (
    <div className="container mx-auto py-8 max-w-4xl">
      {/* Header */}
      <div className="mb-8">
        <Link href="/admin/webhooks">
          <Button variant="ghost" size="sm" className="mb-4">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Webhooks
          </Button>
        </Link>
        <h1 className="text-3xl font-bold">Add New Webhook</h1>
        <p className="text-muted-foreground mt-2">
          Configure a webhook to receive notifications about test failures,
          flakiness, and performance issues
        </p>
      </div>

      {/* Form */}
      <WebhookForm />
    </div>
  );
}
