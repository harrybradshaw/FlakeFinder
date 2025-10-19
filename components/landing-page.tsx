import { SignInButton, SignUpButton } from "@clerk/nextjs"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { CheckCircle2, TrendingUp, Users, Shield } from "lucide-react"

export function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto px-4 py-16">
        {/* Hero Section */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h1 className="text-5xl font-bold text-foreground mb-4">
            FlakeFinder
          </h1>
          <p className="text-xl text-muted-foreground mb-8">
            Monitor your Playwright test results and trends over time. 
            Track flaky tests, identify patterns, and improve test reliability.
          </p>
          <div className="flex items-center justify-center gap-4">
            <SignUpButton mode="modal">
              <Button size="lg" className="bg-blue-600 hover:bg-blue-700 text-white">
                Get Started
              </Button>
            </SignUpButton>
            <SignInButton mode="modal">
              <Button size="lg" variant="outline">
                Sign In
              </Button>
            </SignInButton>
          </div>
        </div>

        {/* Features Section */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-16">
          <Card className="p-6">
            <div className="flex flex-col items-center text-center">
              <div className="h-12 w-12 rounded-lg bg-green-500/10 flex items-center justify-center mb-4">
                <CheckCircle2 className="h-6 w-6 text-green-500" />
              </div>
              <h3 className="font-semibold mb-2">Test Results</h3>
              <p className="text-sm text-muted-foreground">
                View detailed test results with screenshots, error messages, and retry attempts
              </p>
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex flex-col items-center text-center">
              <div className="h-12 w-12 rounded-lg bg-blue-500/10 flex items-center justify-center mb-4">
                <TrendingUp className="h-6 w-6 text-blue-500" />
              </div>
              <h3 className="font-semibold mb-2">Trends & Analytics</h3>
              <p className="text-sm text-muted-foreground">
                Track pass rates over time and identify flaky tests that need attention
              </p>
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex flex-col items-center text-center">
              <div className="h-12 w-12 rounded-lg bg-purple-500/10 flex items-center justify-center mb-4">
                <Users className="h-6 w-6 text-purple-500" />
              </div>
              <h3 className="font-semibold mb-2">Team Collaboration</h3>
              <p className="text-sm text-muted-foreground">
                Organization-based access control for multi-team projects
              </p>
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex flex-col items-center text-center">
              <div className="h-12 w-12 rounded-lg bg-orange-500/10 flex items-center justify-center mb-4">
                <Shield className="h-6 w-6 text-orange-500" />
              </div>
              <h3 className="font-semibold mb-2">Secure & Private</h3>
              <p className="text-sm text-muted-foreground">
                Your test data is secure with authentication and organization-level access
              </p>
            </div>
          </Card>
        </div>

        {/* How It Works Section */}
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl font-bold mb-8">How It Works</h2>
          <div className="space-y-6 text-left">
            <div className="flex gap-4">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold">
                1
              </div>
              <div>
                <h3 className="font-semibold mb-1">Sign Up & Create Organization</h3>
                <p className="text-sm text-muted-foreground">
                  Create an account and set up your organization to get started
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold">
                2
              </div>
              <div>
                <h3 className="font-semibold mb-1">Upload Test Results</h3>
                <p className="text-sm text-muted-foreground">
                  Upload your Playwright HTML report as a ZIP file through the dashboard
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold">
                3
              </div>
              <div>
                <h3 className="font-semibold mb-1">Monitor & Analyze</h3>
                <p className="text-sm text-muted-foreground">
                  View trends, identify flaky tests, and improve your test suite reliability
                </p>
              </div>
            </div>
          </div>

          <div className="mt-12">
            <SignUpButton mode="modal">
              <Button size="lg" className="bg-blue-600 hover:bg-blue-700 text-white">
                Start Monitoring Your Tests
              </Button>
            </SignUpButton>
          </div>
        </div>
      </main>
    </div>
  )
}
