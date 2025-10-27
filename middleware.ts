import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const isProtectedRoute = createRouteMatcher([
  "/api/(.*)", // Protect all API routes
  "/runs/(.*)", // Protect test run pages
  "/tests/(.*)", // Protect test pages
  "/tests",
  "/admin/(.*)", // Protect admin routes
]);

const isAdminRoute = createRouteMatcher(["/admin/(.*)"]);

const isCIRoute = createRouteMatcher(["/api/ci-upload"]);

export default clerkMiddleware(async (auth, req) => {
  if (isCIRoute(req)) {
    return;
  }

  if (isProtectedRoute(req)) {
    await auth.protect();
  }

  if (isAdminRoute(req)) {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.redirect(new URL("/", req.url));
    }

    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
      throw new Error();
    }

    // FIXME: Claim on JWT.
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY,
    );

    const { data: userOrgs } = await supabase
      .from("user_organizations")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "owner");

    if (!userOrgs || userOrgs.length === 0) {
      return NextResponse.redirect(new URL("/", req.url));
    }
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
  runtime: "nodejs",
};
