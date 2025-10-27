"use client";

/**
 * Webhook Configuration Form
 * Client component for creating/editing webhook configurations
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";

type WebhookType = "slack" | "teams" | "discord" | "generic";
type TriggerType =
  | "test_failed"
  | "test_flaky"
  | "performance_regression"
  | "flakiness_threshold"
  | "run_failed";

const WEBHOOK_TYPES: {
  value: WebhookType;
  label: string;
  description: string;
}[] = [
  {
    value: "slack",
    label: "Slack",
    description: "Send notifications to Slack channels",
  },
  {
    value: "teams",
    label: "Microsoft Teams",
    description: "Send notifications to Teams channels",
  },
  {
    value: "discord",
    label: "Discord",
    description: "Send notifications to Discord channels",
  },
  {
    value: "generic",
    label: "Generic Webhook",
    description: "Custom HTTP webhook endpoint",
  },
];

const TRIGGER_TYPES: {
  value: TriggerType;
  label: string;
  description: string;
}[] = [
  {
    value: "test_failed",
    label: "Test Failed",
    description: "When a test fails",
  },
  {
    value: "test_flaky",
    label: "Test Flaky",
    description: "When a test is detected as flaky",
  },
  {
    value: "performance_regression",
    label: "Performance Regression",
    description: "When test performance degrades",
  },
  {
    value: "flakiness_threshold",
    label: "Flakiness Threshold",
    description: "When flakiness exceeds threshold",
  },
  {
    value: "run_failed",
    label: "Run Failed",
    description: "When an entire test run fails",
  },
];

type Organization = {
  id: string;
  name: string;
};

type Project = {
  id: string;
  name: string;
  display_name: string;
};

const fetcher = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Failed to fetch");
  return response.json();
};

export function WebhookForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: "",
    webhookType: "slack" as WebhookType,
    webhookUrl: "",
    secretKey: "",
    enabled: true,
    organizationId: "",
    projectId: "", // Empty string means "all projects"
  });

  const [selectedTriggers, setSelectedTriggers] = useState<TriggerType[]>([]);

  // Fetch user's organizations
  const { data: orgsData, isLoading: loadingOrgs } = useSWR<{
    organizations: Organization[];
  }>("/api/user/organizations", fetcher, {
    revalidateOnFocus: false,
    onSuccess: (data) => {
      // Auto-select first organization if available and none selected
      if (
        data.organizations &&
        data.organizations.length > 0 &&
        !formData.organizationId
      ) {
        setFormData((prev) => ({
          ...prev,
          organizationId: data.organizations[0].id,
        }));
      }
    },
  });
  const organizations = orgsData?.organizations || [];

  // Fetch projects (only when organization is selected)
  const { data: projectsData, isLoading: loadingProjects } = useSWR<{
    projects: Project[];
  }>(
    formData.organizationId
      ? `/api/projects?organizationId=${formData.organizationId}`
      : null,
    fetcher,
    {
      revalidateOnFocus: false,
    },
  );
  const projects = projectsData?.projects || [];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // Validate organization selection
    if (!formData.organizationId) {
      setError("Please select an organization");
      setLoading(false);
      return;
    }

    try {
      const response = await fetch("/api/webhooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name,
          webhookType: formData.webhookType,
          webhookUrl: formData.webhookUrl,
          secretKey: formData.secretKey,
          enabled: formData.enabled,
          organizationId: formData.organizationId,
          projectId: formData.projectId || null, // null means all projects
          triggers: selectedTriggers,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to create webhook");
      }

      router.push("/admin/webhooks");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const toggleTrigger = (trigger: TriggerType) => {
    setSelectedTriggers((prev) =>
      prev.includes(trigger)
        ? prev.filter((t) => t !== trigger)
        : [...prev, trigger],
    );
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="space-y-6">
        {/* Basic Information */}
        <Card>
          <CardHeader>
            <CardTitle>Basic Information</CardTitle>
            <CardDescription>
              Configure the webhook endpoint details
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="organization" className="text-base font-medium">
                Organization
              </Label>
              <select
                id="organization"
                className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                value={formData.organizationId}
                onChange={(e) => {
                  setFormData({
                    ...formData,
                    organizationId: e.target.value,
                    projectId: "",
                  });
                }}
                required
                disabled={loadingOrgs}
              >
                <option value="">Select an organization...</option>
                {organizations.map((org) => (
                  <option key={org.id} value={org.id}>
                    {org.name}
                  </option>
                ))}
              </select>
              <p className="text-sm text-muted-foreground mt-1.5">
                The organization this webhook will monitor
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="project" className="text-base font-medium">
                Project{" "}
                <span className="text-muted-foreground font-normal">
                  (Optional)
                </span>
              </Label>
              <select
                id="project"
                className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                value={formData.projectId}
                onChange={(e) =>
                  setFormData({ ...formData, projectId: e.target.value })
                }
                disabled={!formData.organizationId || loadingProjects}
              >
                <option value="">All projects in organization</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.display_name || project.name}
                  </option>
                ))}
              </select>
              <p className="text-sm text-muted-foreground mt-1.5">
                Leave empty to monitor all projects, or select a specific
                project
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="name" className="text-base font-medium">
                Webhook Name
              </Label>
              <Input
                id="name"
                placeholder="e.g., Production Failures Slack"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                required
                className="h-11"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="webhookType" className="text-base font-medium">
                Webhook Type
              </Label>
              <select
                id="webhookType"
                className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                value={formData.webhookType}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    webhookType: e.target.value as WebhookType,
                  })
                }
                required
              >
                {WEBHOOK_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
              <p className="text-sm text-muted-foreground mt-1.5">
                {
                  WEBHOOK_TYPES.find((t) => t.value === formData.webhookType)
                    ?.description
                }
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="webhookUrl" className="text-base font-medium">
                Webhook URL
              </Label>
              <Input
                id="webhookUrl"
                type="url"
                placeholder="https://hooks.slack.com/services/..."
                value={formData.webhookUrl}
                onChange={(e) =>
                  setFormData({ ...formData, webhookUrl: e.target.value })
                }
                required
                className="h-11 font-mono text-sm"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="secretKey" className="text-base font-medium">
                Secret Key{" "}
                <span className="text-muted-foreground font-normal">
                  (Optional)
                </span>
              </Label>
              <Input
                id="secretKey"
                type="password"
                placeholder="For HMAC signature verification"
                value={formData.secretKey}
                onChange={(e) =>
                  setFormData({ ...formData, secretKey: e.target.value })
                }
                className="h-11"
              />
              <p className="text-sm text-muted-foreground mt-1.5">
                Optional secret for verifying webhook signatures
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Triggers */}
        <Card>
          <CardHeader>
            <CardTitle>Notification Triggers</CardTitle>
            <CardDescription>Select when to send notifications</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {TRIGGER_TYPES.map((trigger) => (
                <label
                  key={trigger.value}
                  className={`flex items-start gap-4 p-4 border rounded-lg cursor-pointer transition-all ${
                    selectedTriggers.includes(trigger.value)
                      ? "border-primary bg-primary/5 shadow-sm"
                      : "border-border hover:border-primary/50 hover:bg-accent/50"
                  }`}
                >
                  <div className="flex items-center pt-0.5">
                    <input
                      type="checkbox"
                      checked={selectedTriggers.includes(trigger.value)}
                      onChange={() => toggleTrigger(trigger.value)}
                      className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-2 focus:ring-primary focus:ring-offset-2"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-base mb-1">
                      {trigger.label}
                    </div>
                    <div className="text-sm text-muted-foreground leading-relaxed">
                      {trigger.description}
                    </div>
                  </div>
                </label>
              ))}
            </div>
            {selectedTriggers.length === 0 && (
              <p className="text-sm text-destructive mt-4 font-medium">
                Please select at least one trigger
              </p>
            )}
          </CardContent>
        </Card>

        {/* Error Message */}
        {error && (
          <div className="p-4 border border-destructive bg-destructive/10 rounded-lg">
            <p className="text-sm text-destructive font-medium">{error}</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-3 pt-2">
          <Button
            type="submit"
            disabled={
              loading ||
              selectedTriggers.length === 0 ||
              !formData.organizationId ||
              loadingOrgs
            }
            size="lg"
            className="min-w-[160px]"
          >
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Create Webhook
          </Button>
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={() => router.push("/admin/webhooks")}
            disabled={loading}
          >
            Cancel
          </Button>
        </div>
      </div>
    </form>
  );
}
