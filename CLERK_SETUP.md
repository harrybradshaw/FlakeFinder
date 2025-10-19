# Clerk Authentication Setup

This project now includes Clerk authentication following the latest Next.js App Router best practices.

## What Was Integrated

✅ **@clerk/nextjs** (v6.33.7) - Latest Clerk SDK for Next.js  
✅ **middleware.ts** - Uses `clerkMiddleware()` from `@clerk/nextjs/server`  
✅ **app/layout.tsx** - Wrapped with `<ClerkProvider>` and includes auth UI components  
✅ **Environment variables** - Template provided in `.env.local.example`

## Getting Started

### 1. Create a Clerk Account

1. Visit [https://dashboard.clerk.com/](https://dashboard.clerk.com/)
2. Sign up for a free account
3. Create a new application

### 2. Get Your API Keys

1. In your Clerk dashboard, go to **API Keys**
2. Copy your **Publishable Key** (starts with `pk_test_...`)
3. Copy your **Secret Key** (starts with `sk_test_...`)

### 3. Configure Environment Variables

Create a `.env.local` file in the project root:

```bash
cp .env.local.example .env.local
```

Then edit `.env.local` and add your keys:

```env
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_your_key_here
CLERK_SECRET_KEY=sk_test_your_key_here
```

### 4. Start the Development Server

```bash
pnpm dev
```

Visit [http://localhost:3000](http://localhost:3000) and you should see:

- **Sign In** and **Sign Up** buttons in the header (when logged out)
- **User Button** with profile menu (when logged in)

## Implementation Details

### Middleware (`middleware.ts`)

Uses the current `clerkMiddleware()` function (not the deprecated `authMiddleware`):

```typescript
import { clerkMiddleware } from "@clerk/nextjs/server";

export default clerkMiddleware();
```

### Root Layout (`app/layout.tsx`)

- Wrapped with `<ClerkProvider>`
- Includes `<SignInButton>`, `<SignUpButton>`, `<UserButton>`
- Uses `<SignedIn>` and `<SignedOut>` components for conditional rendering

### Authentication in API Routes

To protect API routes or get user information:

```typescript
import { auth } from "@clerk/nextjs/server";

export async function GET() {
  const { userId } = await auth();

  if (!userId) {
    return new Response("Unauthorized", { status: 401 });
  }

  // Your protected logic here
}
```

### Authentication in Server Components

```typescript
import { auth, currentUser } from '@clerk/nextjs/server'

export default async function Page() {
  const { userId } = await auth()
  const user = await currentUser()

  return <div>Hello {user?.firstName}</div>
}
```

### Authentication in Client Components

```typescript
'use client'

import { useUser } from '@clerk/nextjs'

export default function ClientComponent() {
  const { isLoaded, isSignedIn, user } = useUser()

  if (!isLoaded) return <div>Loading...</div>
  if (!isSignedIn) return <div>Please sign in</div>

  return <div>Hello {user.firstName}</div>
}
```

## Customization

### Custom Sign-In/Sign-Up Pages

If you want dedicated pages instead of modals, update your `.env.local`:

```env
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/dashboard
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/onboarding
```

Then create the pages:

```typescript
// app/sign-in/[[...sign-in]]/page.tsx
import { SignIn } from '@clerk/nextjs'

export default function Page() {
  return <SignIn />
}
```

### Protecting Routes

To protect specific routes, modify `middleware.ts`:

```typescript
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isProtectedRoute = createRouteMatcher(["/dashboard(.*)", "/admin(.*)"]);

export default clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req)) await auth.protect();
});
```

## Resources

- [Clerk Next.js Quickstart](https://clerk.com/docs/quickstarts/nextjs)
- [Clerk Documentation](https://clerk.com/docs)
- [Clerk Dashboard](https://dashboard.clerk.com/)

## Verification Checklist

✅ Using `clerkMiddleware()` (not deprecated `authMiddleware`)  
✅ Using App Router structure (not Pages Router)  
✅ Importing from `@clerk/nextjs` and `@clerk/nextjs/server`  
✅ `<ClerkProvider>` wraps the entire app in `app/layout.tsx`  
✅ Using `async/await` with `auth()` function
