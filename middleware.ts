import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Define routes that require authentication
const isProtectedRoute = createRouteMatcher([
  "/api/(.*)", // Protect all API routes
  "/runs/(.*)", // Protect test run pages
  "/tests/(.*)", // Protect test pages
  "/tests",
]);

// CI/CD routes that use API key auth instead of Clerk auth
const isCIRoute = createRouteMatcher([
  "/api/ci-upload",
]);

export default clerkMiddleware(async (auth, req) => {
  // Skip Clerk auth for CI routes (they use API key auth)
  if (isCIRoute(req)) {
    return;
  }
  
  // Protect other API routes - require authentication
  if (isProtectedRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
