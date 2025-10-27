"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Shield, Trash2, User } from "lucide-react";
import Image from "next/image";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface ClerkUser {
  id: string;
  email: string;
  name: string;
  imageUrl: string | null;
}

interface Member {
  id: string;
  user_id: string;
  role: string;
  created_at: string;
  clerkUser: ClerkUser;
}

interface OrganizationMemberListProps {
  members: Member[];
  organizationId: string;
  organizationName: string;
  currentUserId: string;
}

export function OrganizationMemberList({
  members,
  organizationId,
  organizationName,
  currentUserId,
}: OrganizationMemberListProps) {
  const router = useRouter();
  const [memberToDelete, setMemberToDelete] = useState<Member | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDeleteMember = async () => {
    if (!memberToDelete) return;

    setIsDeleting(true);

    try {
      const response = await fetch("/api/user-organizations", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          userId: memberToDelete.user_id,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setMemberToDelete(null);
        router.refresh();
      } else {
        alert(`❌ Error\n\n${data.error || "Failed to remove member"}`);
      }
    } catch (_error) {
      alert("Failed to remove member");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <div className="space-y-3">
        {members.map((member) => {
          const clerkUser = member.clerkUser;
          return (
            <div
              key={member.id}
              className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center gap-4 flex-1 min-w-0">
                <div className="flex-shrink-0 w-10 h-10 rounded-full overflow-hidden bg-primary/10 flex items-center justify-center">
                  {clerkUser?.imageUrl ? (
                    <Image
                      src={clerkUser.imageUrl}
                      alt={clerkUser.name}
                      width={40}
                      height={40}
                      className="object-cover"
                    />
                  ) : (
                    <User className="h-5 w-5 text-primary" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">
                    {clerkUser?.name || "Unknown User"}
                  </p>
                  <p className="text-sm text-muted-foreground truncate">
                    {clerkUser?.email || member.user_id}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right mr-2 hidden sm:block">
                  <p className="text-xs text-muted-foreground">
                    Added {new Date(member.created_at).toLocaleDateString()}
                  </p>
                </div>
                <Badge
                  variant={member.role === "owner" ? "default" : "secondary"}
                  className="flex items-center gap-1.5 px-3 py-1"
                >
                  <Shield className="h-3 w-3" />
                  {member.role}
                </Badge>
                {member.user_id !== currentUserId && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-9 w-9 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={() => setMemberToDelete(member)}
                    title="Remove member"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <AlertDialog
        open={!!memberToDelete}
        onOpenChange={(open) => !open && setMemberToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Member</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove{" "}
              <strong>{memberToDelete?.clerkUser?.name}</strong> from{" "}
              <strong>{organizationName}</strong>? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteMember}
              disabled={isDeleting}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {isDeleting ? "Removing..." : "Remove Member"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
