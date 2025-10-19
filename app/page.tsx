import { SignedIn, SignedOut } from "@clerk/nextjs";
import { TestDashboard } from "@/components/test-dashboard";
import { LandingPage } from "@/components/landing-page";

export default function Home() {
  return (
    <>
      <SignedOut>
        <LandingPage />
      </SignedOut>
      <SignedIn>
        <TestDashboard />
      </SignedIn>
    </>
  );
}
