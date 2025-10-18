# Database Setup

## Tables Created

### `test_runs`
Stores high-level information about each test run:
- `id` - Unique identifier (UUID)
- `environment` - Environment where tests ran (e.g., "staging", "production")
- `trigger` - What triggered the test run (e.g., "manual", "ci")
- `branch` - Git branch name
- `commit` - Git commit hash
- `total` - Total number of tests
- `passed` - Number of passed tests
- `failed` - Number of failed tests
- `flaky` - Number of flaky tests
- `skipped` - Number of skipped tests
- `duration` - Total duration in milliseconds
- `timestamp` - When the test run occurred

### `tests`
Stores individual test results:
- `id` - Unique identifier (UUID)
- `test_run_id` - Foreign key to `test_runs`
- `name` - Test name/title
- `status` - Test status (passed, failed, flaky, skipped, timedOut)
- `duration` - Test duration in milliseconds
- `file` - Test file path
- `error` - Error message (if failed)
- `screenshots` - JSONB array of screenshot URLs

## Applying the Schema

### Method 1: Supabase Dashboard
1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Copy the contents of `schema.sql`
4. Paste and click **Run**

### Method 2: Command Line
If you have `psql` configured:
```bash
psql $DATABASE_URL -f schema.sql
```

## Security Notes
The schema includes Row Level Security (RLS) policies that allow all operations. 
You may want to tighten these based on your security requirements.
