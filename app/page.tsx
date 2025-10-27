import { SignedIn, SignedOut } from "@clerk/nextjs";
import { TestDashboard } from "@/components/test-dashboard";
import { LandingPage } from "@/components/landing-page";
import { Suspense } from "react";

export default async function Home() {
  return (
    <Suspense>
      <SignedOut>
        <LandingPage />
      </SignedOut>
      <SignedIn>
        <TestDashboard />
      </SignedIn>
    </Suspense>
  );
}
