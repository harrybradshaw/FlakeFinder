/**
 * Admin Dashboard
 * Central hub for administrative functions
 */

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Settings, Users, Webhook } from "lucide-react";
import Link from "next/link";
import { Route } from "next";

export default function AdminPage() {
  return (
    <div className="container mx-auto px-4 py-12 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Admin Dashboard</h1>
        <p className="text-muted-foreground mt-2">
          Manage your organization settings and configurations
        </p>
      </div>

      {/* Admin Cards */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {/* Webhook Management */}
        <Link href="/admin/webhooks" className="group">
          <Card className="h-full transition-all hover:shadow-lg hover:border-primary">
            <CardHeader className="pb-3 pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-lg group-hover:bg-primary/20 transition-colors">
                  <Webhook className="h-6 w-6 text-primary" />
                </div>
                <CardTitle className="text-xl">Webhook Management</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <CardDescription className="text-base leading-relaxed">
                Configure webhooks for Slack, Discord, and other services to
                receive notifications about test failures, flakiness alerts, and
                performance regressions.
              </CardDescription>
            </CardContent>
          </Card>
        </Link>

        {/* Organization Management */}
        <Link href="/admin/organizations" className="group">
          <Card className="h-full transition-all hover:shadow-lg hover:border-primary">
            <CardHeader className="pb-3 pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-lg group-hover:bg-primary/20 transition-colors">
                  <Users className="h-6 w-6 text-primary" />
                </div>
                <CardTitle className="text-xl">
                  Organization Management
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <CardDescription className="text-base leading-relaxed">
                Manage organization members, roles, and permissions. Add or
                remove users and control access to projects.
              </CardDescription>
            </CardContent>
          </Card>
        </Link>

        {/* Settings (Placeholder for future) */}
        <Link href={"/admin/settings" as Route} className="group">
          <Card className="h-full transition-all hover:shadow-lg hover:border-primary">
            <CardHeader className="pb-3 pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-lg group-hover:bg-primary/20 transition-colors">
                  <Settings className="h-6 w-6 text-primary" />
                </div>
                <CardTitle className="text-xl">Settings</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <CardDescription className="text-base leading-relaxed">
                Configure general settings, API keys, integrations, and other
                system-wide preferences.
              </CardDescription>
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}
