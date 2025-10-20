"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import useSWR from "swr";
import {
  SignInButton,
  SignUpButton,
  SignedIn,
  SignedOut,
  UserButton,
  useAuth,
} from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { UploadDialog } from "@/components/upload-dialog";

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

  // Determine if we're on the home page
  const isHomePage = pathname === "/";

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
    isSignedIn && isHomePage ? "/api/projects" : null,
    configFetcher,
    {
      revalidateOnFocus: false,
    },
  );
  const projects = projectsData?.projects || [];

  // Handle project change
  const handleProjectChange = (value: string) => {
    setSelectedProject(value);

    // Update URL params
    const params = new URLSearchParams(searchParams.toString());
    if (value === "all") {
      params.delete("project");
    } else {
      params.set("project", value);
    }

    router.push(`/?${params.toString()}`);
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
                onValueChange={setSelectedProject}
              >
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Select Project" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Projects</SelectItem>
                  {projects.map((proj: any) => (
                    <SelectItem key={proj.id} value={proj.name}>
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
            <SignedOut>
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
            </SignedOut>
            <SignedIn>
              <Link href="/tests" prefetch={false}>
                <Button variant="outline">Test Health</Button>
              </Link>
              <UploadDialog />
              <UserButton />
            </SignedIn>
          </div>
        </div>
      </div>
    </header>
  );
}
