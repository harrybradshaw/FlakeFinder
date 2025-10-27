"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { UserPlus, Loader2, User } from "lucide-react";
import { useRouter } from "next/navigation";
import Image from "next/image";

interface InviteMemberDialogProps {
  organizationId: string;
  organizationName: string;
  variant?: "default" | "outline";
  size?: "default" | "sm" | "lg" | "icon";
  className?: string;
}

export function InviteMemberDialog({
  organizationId,
  organizationName,
  variant = "outline",
  size = "default",
  className,
}: InviteMemberDialogProps) {
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<"member" | "owner">("member");
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [availableUsers, setAvailableUsers] = useState<any[]>([]);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const router = useRouter();

  // Fetch available users when dialog opens
  useEffect(() => {
    if (open) {
      fetchAvailableUsers();
    }
  }, [open]);

  const fetchAvailableUsers = async () => {
    setLoading(true);
    setAvailableUsers([]);
    setSelectedUser(null);

    try {
      const response = await fetch("/api/users/available", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId }),
      });

      const data = await response.json();

      if (data.users) {
        setAvailableUsers(data.users);
      } else {
        alert(data.error || "Failed to load users");
      }
    } catch (_error) {
      alert("Failed to load available users");
    } finally {
      setLoading(false);
    }
  };

  const handleAddMember = async () => {
    if (!selectedUser) return;

    setAdding(true);

    try {
      const response = await fetch("/api/user-organizations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organization_id: organizationId,
          user_id: selectedUser.id,
          role,
        }),
      });

      const data = await response.json();

      if (response.ok && data.membership) {
        alert(
          `✅ Success!\n\n${selectedUser.name} has been added to ${organizationName}`,
        );
        setOpen(false);
        setSelectedUser(null);
        setRole("member");
        router.refresh();
      } else {
        alert(`❌ Error\n\n${data.error || "Failed to add member"}`);
      }
    } catch (_error) {
      alert("Failed to add member");
    } finally {
      setAdding(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={variant} size={size} className={className}>
          <UserPlus className="h-4 w-4 mr-2" />
          {size !== "icon" && "Add Member"}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Add Member to {organizationName}</DialogTitle>
          <DialogDescription>
            Select a user from your organization to add as a member.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Loading State */}
          {loading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          )}

          {/* Available Users List */}
          {!loading && availableUsers.length > 0 && (
            <div className="space-y-2">
              <Label>Select User</Label>
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {availableUsers.map((user: any) => (
                  <div
                    key={user.id}
                    onClick={() => setSelectedUser(user)}
                    className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                      selectedUser?.id === user.id
                        ? "border-primary bg-primary/5"
                        : "hover:bg-muted/50"
                    }`}
                  >
                    <div className="flex-shrink-0 w-10 h-10 rounded-full overflow-hidden bg-primary/10 flex items-center justify-center">
                      {user.imageUrl ? (
                        <Image
                          src={user.imageUrl}
                          alt={user.name}
                          width={40}
                          height={40}
                          className="object-cover"
                        />
                      ) : (
                        <User className="h-5 w-5 text-primary" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{user.name}</p>
                      <p className="text-sm text-muted-foreground truncate">
                        {user.email}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* No Users Available */}
          {!loading && availableUsers.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <p>No users available to add.</p>
              <p className="text-sm mt-1">
                All registered users are already members.
              </p>
            </div>
          )}

          {/* Role Selection */}
          {selectedUser && (
            <div className="space-y-2">
              <Label htmlFor="role">Role</Label>
              <Select
                value={role}
                onValueChange={(value: any) => setRole(value)}
              >
                <SelectTrigger id="role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="member">Member</SelectItem>
                  <SelectItem value="owner">Owner</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {role === "owner"
                  ? "Owners can manage members and organization settings"
                  : "Members can view and use the organization's resources"}
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleAddMember} disabled={!selectedUser || adding}>
            {adding ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Adding...
              </>
            ) : (
              "Add Member"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
