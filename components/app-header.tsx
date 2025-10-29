"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import useSWR from "swr";
import { SignInButton, SignUpButton, UserButton, useAuth } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { UploadDialog } from "@/components/upload-dialog";
import { Settings } from "lucide-react";
import { Route } from "next";

const configFetcher = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Failed to fetch");
  return response.json();
};

export function AppHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isSignedIn } = useAuth();

  // Get project from URL or default to "all"
  const projectFromUrl = searchParams.get("project") || "all";
  const [selectedProject, setSelectedProject] =
    useState<string>(projectFromUrl);

  // Sync state with URL
  useEffect(() => {
    setSelectedProject(projectFromUrl);
  }, [projectFromUrl]);

  // Fetch projects dynamically (only if signed in and on home page)
  const { data: projectsData } = useSWR(
    isSignedIn ? "/api/projects" : null,
    configFetcher,
    {
      revalidateOnFocus: false,
    },
  );
  const projects = projectsData?.projects || [];

  // Check if user is an owner of any organization
  const { data: userRoleData } = useSWR(
    isSignedIn ? "/api/user/role" : null,
    configFetcher,
    {
      revalidateOnFocus: false,
    },
  );
  const isOwner = userRoleData?.isOwner || false;

  // Check if user is a member of any organization
  const { data: userOrgsData } = useSWR(
    isSignedIn ? "/api/user/organizations" : null,
    configFetcher,
    {
      revalidateOnFocus: false,
    },
  );
  const hasOrganization = (userOrgsData?.organizations?.length || 0) > 0;

  // Handle project change
  const handleProjectChange = (value: string) => {
    setSelectedProject(value);

    // Update URL params while preserving current path
    const params = new URLSearchParams(searchParams.toString());
    if (value === "all") {
      params.delete("project");
    } else {
      params.set("project", value);
    }

    // Navigate to current path with updated params
    const newUrl = params.toString()
      ? `${pathname}?${params.toString()}`
      : pathname;
    router.push(newUrl as Route);
  };

  return (
    <header className="border-b border-border bg-card">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link href="/" prefetch={false}>
              <h1 className="text-2xl font-semibold text-foreground hover:text-foreground/80 cursor-pointer">
                FlakeFinder
              </h1>
            </Link>
            {projects.length > 1 && (
              <Select
                value={selectedProject}
                onValueChange={handleProjectChange}
              >
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Select Project" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Projects</SelectItem>
                  {projects.map((proj: any) => (
                    <SelectItem key={proj.id} value={proj.id}>
                      <div className="flex items-center gap-2">
                        <div
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: proj.color }}
                        />
                        {proj.display_name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="flex items-center gap-3">
            {isSignedIn ? (
              <>
                <Link href="/tests" prefetch={false}>
                  <Button variant="outline">Test Health</Button>
                </Link>
                {hasOrganization && <UploadDialog />}
                {isOwner && (
                  <Link href="/admin" prefetch={false}>
                    <Button variant="ghost" size="icon" title="Admin Dashboard">
                      <Settings className="h-5 w-5" />
                    </Button>
                  </Link>
                )}
                <UserButton />
              </>
            ) : (
              <>
                <SignInButton mode="modal">
                  <button className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900">
                    Sign In
                  </button>
                </SignInButton>
                <SignUpButton mode="modal">
                  <button className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700">
                    Sign Up
                  </button>
                </SignUpButton>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
