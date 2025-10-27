/**
 * Organization Management Page
 * Manage organization members, roles, and permissions
 */

import { auth, clerkClient } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";
import { type Database } from "@/types/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { redirect } from "next/navigation";
import { InviteMemberDialog } from "@/components/organizations/invite-member-dialog";
import { OrganizationMemberList } from "@/components/organizations/organization-member-list";

export default async function OrganizationManagementPage() {
  const { userId } = await auth();

  if (!userId) {
    redirect("/");
  }

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
    return (
      <div className="container mx-auto px-4 py-12">
        <Card>
          <CardContent>
            <p className="text-destructive">Database not configured</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const supabase = createClient<Database>(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY,
  );

  // Get user's organizations where they are an owner
  const { data: userOrgs } = await supabase
    .from("user_organizations")
    .select("organization_id, role, organizations(id, name)")
    .eq("user_id", userId)
    .eq("role", "owner");

  if (!userOrgs || userOrgs.length === 0) {
    redirect("/");
  }

  // Get all members for the user's organizations
  const orgIds = userOrgs.map((org) => org.organization_id);
  const { data: members } = await supabase
    .from("user_organizations")
    .select("*")
    .in("organization_id", orgIds)
    .order("created_at", { ascending: false });

  // Fetch Clerk user details for all members
  const userIds = members?.map((m) => m.user_id) || [];
  const uniqueUserIds = [...new Set(userIds)];

  const clerk = await clerkClient();
  const clerkUsers = await Promise.all(
    uniqueUserIds.map(async (id) => {
      try {
        const user = await clerk.users.getUser(id);
        return {
          id: user.id,
          email: user.emailAddresses[0]?.emailAddress || "No email",
          name:
            `${user.firstName || ""} ${user.lastName || ""}`.trim() ||
            "Unknown User",
          imageUrl: user.imageUrl,
        };
      } catch {
        return {
          id,
          email: "Unknown",
          name: "Unknown User",
          imageUrl: null,
        };
      }
    }),
  );

  const clerkUserMap = Object.fromEntries(
    clerkUsers.map((user) => [user.id, user]),
  );

  // Group members by organization
  const membersByOrg = members?.reduce((acc: Record<string, any>, member) => {
    if (!acc[member.organization_id]) {
      acc[member.organization_id] = [];
    }
    acc[member.organization_id].push({
      ...member,
      clerkUser: clerkUserMap[member.user_id],
    });
    return acc;
  }, {});

  return (
    <div className="container mx-auto px-4 py-12 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Organization Management</h1>
        <p className="text-muted-foreground mt-2">
          Manage members, roles, and permissions for your organizations
        </p>
      </div>

      {/* Organizations */}
      <div className="space-y-8">
        {userOrgs.map((userOrg) => {
          const org = userOrg.organizations;
          const orgMembers = membersByOrg?.[userOrg.organization_id] || [];

          return (
            <Card key={org.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-2xl">{org.name}</CardTitle>
                    <p className="text-sm text-muted-foreground mt-1">
                      {orgMembers.length}{" "}
                      {orgMembers.length === 1 ? "member" : "members"}
                    </p>
                  </div>
                  <InviteMemberDialog
                    organizationId={org.id}
                    organizationName={org.name}
                  />
                </div>
              </CardHeader>
              <CardContent>
                <OrganizationMemberList
                  members={orgMembers}
                  organizationId={org.id}
                  organizationName={org.name}
                  currentUserId={userId}
                />
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
