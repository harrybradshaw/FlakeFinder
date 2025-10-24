# FlakeFinder

A platform for monitoring Playwright test results and tracking flaky tests. Identify patterns, analyze trends, and improve test reliability across your team.

## What It Does

FlakeFinder helps engineering teams gain visibility into their Playwright test suites by:

- **📊 Visualizing Test Results** - Beautiful dashboards showing test outcomes, screenshots, error messages, and retry attempts
- **📈 Tracking Trends** - Historical analysis of test performance and flakiness patterns over time
- **🎯 Detecting Flaky Tests** - Automatically identifies and flags unreliable tests across multiple runs
- **👥 Team Collaboration** - Multi-organization support with role-based access control
- **🔍 Advanced Filtering** - Drill down by status, environment, suite, project, and more
- **📸 Screenshot Management** - Efficient cloud storage and viewing of test screenshots

## Built With

- **Framework**: Next.js 15 with App Router and React Server Components
- **UI**: shadcn/ui components with Tailwind CSS
- **Authentication**: Clerk for secure multi-tenant auth
- **Database**: Supabase (PostgreSQL) for scalable data storage
- **Storage**: Supabase for screenshot and artifact management
- **Testing**: Vitest with React Testing Library
- **Deployment**: Vercel with edge functions

## Development

To run the project locally:

```bash
# Install dependencies
pnpm install

# Set up environment variables
cp .env.example .env.local
# Configure Clerk and Supabase credentials

# Run the development server
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) to view the application.

## Available Scripts

- `pnpm dev` - Start development server with Turbopack
- `pnpm build` - Build for production
- `pnpm start` - Start production server
- `pnpm lint` - Run ESLint
- `pnpm test` - Run tests with Vitest
- `pnpm test:ui` - Run tests with UI
- `pnpm test:coverage` - Generate test coverage report

## Project Structure

```
├── app/                    # Next.js app router pages
│   ├── api/               # API routes
│   ├── runs/              # Test run pages
│   └── tests/             # Test detail pages
├── components/            # React components
│   ├── ui/               # shadcn/ui components
│   └── ...               # Feature components
├── lib/                   # Utility functions and helpers
└── scripts/              # Migration and utility scripts
```

## Key Features & Architecture

### API Integration

The platform provides REST APIs for seamless CI/CD integration, allowing automated upload of test results from GitHub Actions, Jenkins, CircleCI, and other CI platforms.

### Multi-Tenancy

Built with organization-level isolation using Clerk's multi-tenant architecture, ensuring secure data separation between teams.

### Performance Optimizations

- Server-side rendering with React Server Components
- Efficient screenshot storage with Supabase
- Edge caching for static assets

### Real-time Updates

Track test runs as they happen with live status updates and notifications.

## License

MIT
