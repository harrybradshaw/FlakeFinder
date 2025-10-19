# Screenshot Retention Policy - 30 Days

This guide explains how to set up automatic deletion of screenshots older than 30 days to save storage costs and comply with data retention policies.

## Overview

The retention policy will:
- 🗑️ Delete screenshots from Supabase Storage after 30 days
- 🧹 Clean up screenshot references in the database
- ⏰ Run automatically on a schedule (daily at 2am)
- 📊 Provide cleanup reports

## Option 1: Supabase Edge Function (Recommended)

### Setup Steps

1. **Install Supabase CLI** (if not already installed):
```bash
npm install -g supabase
```

2. **Initialize Supabase in your project** (if not already done):
```bash
supabase init
```

3. **Deploy the cleanup function**:
```bash
supabase functions deploy cleanup-screenshots
```

4. **Set environment variables** for the function:
```bash
supabase secrets set SUPABASE_URL=https://your-project.supabase.co
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

5. **Schedule the function** to run daily at 2am:
```bash
supabase functions schedule cleanup-screenshots --cron "0 2 * * *"
```

Or via the Supabase Dashboard:
- Go to **Edge Functions** > **cleanup-screenshots**
- Click **Settings** > **Cron Jobs**
- Add schedule: `0 2 * * *` (daily at 2am UTC)

### Test the Function

Run manually to test:
```bash
curl -X POST \
  https://your-project.supabase.co/functions/v1/cleanup-screenshots \
  -H "Authorization: Bearer YOUR_ANON_KEY"
```

Or via Supabase Dashboard:
- Go to **Edge Functions** > **cleanup-screenshots**
- Click **Invoke**

### Monitor Execution

View logs:
```bash
supabase functions logs cleanup-screenshots
```

Or in Supabase Dashboard:
- Go to **Edge Functions** > **cleanup-screenshots** > **Logs**

## Option 2: Manual Cleanup Script

If you prefer to run cleanup manually or via your own cron job:

1. **Run the SQL query** to see what will be deleted:
```bash
psql $DATABASE_URL -f scripts/cleanup-old-screenshots.sql
```

2. **Create a Node.js script** to delete files:

```typescript
// scripts/cleanup-screenshots.ts
import { createClient } from '@supabase/supabase-js';

const RETENTION_DAYS = 30;

async function cleanup() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - RETENTION_DAYS);

  // Get old test runs
  const { data: oldTestRuns } = await supabase
    .from('test_runs')
    .select('id')
    .lt('timestamp', cutoffDate.toISOString());

  if (!oldTestRuns?.length) {
    console.log('No old test runs to clean up');
    return;
  }

  const testRunIds = oldTestRuns.map(tr => tr.id);

  // Get tests with screenshots
  const { data: tests } = await supabase
    .from('tests')
    .select('screenshots')
    .in('test_run_id', testRunIds)
    .not('screenshots', 'is', null);

  // Delete from storage
  let deletedCount = 0;
  for (const test of tests || []) {
    for (const url of test.screenshots || []) {
      const match = url.match(/test-screenshots\/(.+?)(\?|$)/);
      if (match?.[1]) {
        await supabase.storage
          .from('test-screenshots')
          .remove([match[1]]);
        deletedCount++;
      }
    }
  }

  // Clear database references
  await supabase
    .from('tests')
    .update({ screenshots: null })
    .in('test_run_id', testRunIds);

  console.log(`Deleted ${deletedCount} screenshots`);
}

cleanup();
```

3. **Run the script**:
```bash
tsx scripts/cleanup-screenshots.ts
```

4. **Schedule with cron** (Linux/Mac):
```bash
# Edit crontab
crontab -e

# Add line to run daily at 2am
0 2 * * * cd /path/to/project && tsx scripts/cleanup-screenshots.ts >> /var/log/screenshot-cleanup.log 2>&1
```

## Option 3: GitHub Actions (CI/CD)

Create `.github/workflows/cleanup-screenshots.yml`:

```yaml
name: Cleanup Old Screenshots

on:
  schedule:
    - cron: '0 2 * * *'  # Daily at 2am UTC
  workflow_dispatch:  # Allow manual trigger

jobs:
  cleanup:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Install dependencies
        run: npm install @supabase/supabase-js
      
      - name: Run cleanup
        env:
          NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.NEXT_PUBLIC_SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
        run: tsx scripts/cleanup-screenshots.ts
```

## Customizing Retention Period

To change from 30 days to a different period:

### Edge Function
Edit `supabase/functions/cleanup-screenshots/index.ts`:
```typescript
const RETENTION_DAYS = 90; // Change to 90 days
```

### Manual Script
Edit the script:
```typescript
const RETENTION_DAYS = 90; // Change to 90 days
```

### SQL Query
Edit `scripts/cleanup-old-screenshots.sql`:
```sql
WHERE tr.timestamp < NOW() - INTERVAL '90 days'  -- Change to 90 days
```

## Monitoring & Alerts

### Set up alerts in Supabase

1. Go to **Settings** > **Alerts**
2. Create alert for storage usage:
   - Metric: Storage size
   - Threshold: 80% of quota
   - Notification: Email

### Check cleanup effectiveness

```sql
-- Storage usage by age
SELECT 
  DATE_TRUNC('month', tr.timestamp) as month,
  COUNT(t.id) as tests_with_screenshots,
  SUM(array_length(t.screenshots, 1)) as total_screenshots
FROM tests t
JOIN test_runs tr ON t.test_run_id = tr.id
WHERE t.screenshots IS NOT NULL
GROUP BY DATE_TRUNC('month', tr.timestamp)
ORDER BY month DESC;
```

## Cost Savings Estimate

Assuming:
- Average screenshot: 500KB
- 100 tests/day with 2 screenshots each = 200 screenshots/day
- 30-day retention vs unlimited

**Without retention policy:**
- 6,000 screenshots/month × 500KB = 3GB storage
- Cost: ~$0.063/month storage + bandwidth

**With 30-day retention:**
- 6,000 screenshots/month × 500KB = 3GB storage (constant)
- Cost: ~$0.063/month storage + bandwidth
- **Savings**: Prevents unlimited growth

**After 1 year without retention:**
- 72,000 screenshots × 500KB = 36GB storage
- Cost: ~$0.756/month storage
- **Savings with retention**: ~$0.693/month (~92% savings)

## Troubleshooting

### Function fails with "Permission denied"

**Solution**: Ensure service role key is set:
```bash
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your-key
```

### Screenshots not being deleted

**Check:**
1. Storage policies allow service role to delete
2. URL pattern matching is correct
3. Function has correct permissions

### Database references not cleared

**Check:**
1. Foreign key constraints
2. RLS policies on tests table
3. Service role has update permissions

## Best Practices

1. **Test first**: Run cleanup manually before scheduling
2. **Monitor logs**: Check for errors regularly
3. **Backup important screenshots**: If needed, export before cleanup
4. **Adjust retention**: Start with 30 days, adjust based on needs
5. **Document policy**: Inform team about retention period

## Compliance

This retention policy helps with:
- **GDPR**: Right to erasure after reasonable period
- **Cost control**: Prevent unlimited storage growth
- **Performance**: Faster queries on smaller dataset
- **Security**: Reduce attack surface by removing old data
