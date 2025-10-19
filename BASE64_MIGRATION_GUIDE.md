# Base64 to Storage Migration Guide

This guide explains how to migrate existing base64-encoded screenshots to Supabase Storage.

## Overview

The migration script will:
1. 🔍 Find all tests with base64-encoded screenshots
2. 📦 Decode base64 data to binary buffers
3. ☁️ Upload images to Supabase Storage
4. 🔗 Generate signed URLs (valid for 1 year)
5. 💾 Update database with new URLs
6. 🧹 Process both `tests` and `test_results` tables

## Prerequisites

1. **Supabase Storage configured**:
   - Bucket `test-screenshots` created
   - Storage policies set up (see `SUPABASE_STORAGE_SETUP.md`)
   - Environment variables configured

2. **Environment variables**:
   ```bash
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   ```

3. **Dependencies installed**:
   ```bash
   pnpm install
   ```

## Running the Migration

### Step 1: Dry Run (Recommended)

First, run in dry-run mode to see what will be migrated without making changes:

```bash
pnpm migrate:screenshots:dry-run
```

This automatically loads your `.env.local` file with environment variables.

This will output:
- Number of tests with base64 screenshots
- Total screenshots to migrate
- Estimated migration scope
- No actual changes made

### Step 2: Review the Output

Check the dry-run output:
```
🚀 Starting base64 to storage migration...
   Mode: DRY RUN (no changes will be made)
   Batch size: 50

📊 Finding tests with base64 screenshots...
   Found 150 tests with base64 screenshots

📦 Processing batch 1/3 (50 tests)...
   [DRY RUN] Would upload screenshot 1/2 for test abc-123
   [DRY RUN] Would upload screenshot 2/2 for test abc-123
   ...

═══════════════════════════════════════════
📊 Migration Summary
═══════════════════════════════════════════
   Tests processed: 150
   Total screenshots found: 300
   Screenshots migrated: 300
   Errors: 0

ℹ️  This was a DRY RUN - no changes were made
```

### Step 3: Run the Actual Migration

If the dry-run looks good, run the actual migration:

```bash
pnpm migrate:screenshots
```

**Note**: This will make actual changes to your database and storage!

### Step 4: Monitor Progress

The script will show progress:
```
📦 Processing batch 1/3 (50 tests)...
   ✓ Migrated 10 screenshots...
   ✓ Migrated 20 screenshots...
   ✓ Migrated 30 screenshots...
   ✓ Batch complete

📦 Processing batch 2/3 (50 tests)...
   ...
```

### Step 5: Review Results

After completion:
```
═══════════════════════════════════════════
📊 Migration Summary
═══════════════════════════════════════════
   Tests processed: 150
   Total screenshots found: 300
   Screenshots migrated: 298
   Errors: 2

✅ Migration complete!

⚠️  2 errors occurred during migration
   Check the logs above for details
   Failed screenshots remain as base64 in the database
```

## Advanced Options

### Custom Batch Size

Process more or fewer tests at once:

```bash
# Process 100 tests per batch (faster but more memory)
tsx scripts/migrate-base64-to-storage.ts --batch-size=100

# Process 10 tests per batch (slower but safer)
tsx scripts/migrate-base64-to-storage.ts --batch-size=10
```

Default: 50 tests per batch

### Resume After Errors

If the migration fails partway through, you can safely re-run it:
- Already migrated screenshots (URLs) are skipped
- Only base64 screenshots are processed
- Idempotent - safe to run multiple times

## What Gets Migrated

### Tests Table
```sql
-- Before
screenshots: ['data:image/png;base64,iVBORw0KGgoAAAANS...']

-- After
screenshots: ['https://project.supabase.co/storage/v1/object/sign/test-screenshots/...']
```

### Test Results Table
```sql
-- Before
screenshots: ['data:image/png;base64,iVBORw0KGgoAAAANS...']

-- After
screenshots: ['https://project.supabase.co/storage/v1/object/sign/test-screenshots/...']
```

## Error Handling

The script handles errors gracefully:

### Upload Fails
- Error logged
- Original base64 kept in database
- Migration continues with next screenshot

### Signed URL Generation Fails
- Uploaded file is deleted from storage
- Original base64 kept in database
- Migration continues

### Database Update Fails
- Error logged
- Files remain in storage (can be cleaned up later)
- Migration continues

## Storage Impact

### Before Migration
- 100 tests × 2 screenshots × 500KB base64 = ~100MB in database
- Database queries slow
- Expensive database storage

### After Migration
- 100 tests × 2 screenshots × 500KB = ~100MB in storage bucket
- Database only stores URLs (~100 bytes each)
- Fast queries
- Cheap storage

### Estimated Savings

For 1000 screenshots:
- **Database size reduction**: ~500MB → ~100KB (99.98% reduction)
- **Storage cost**: Database storage → Blob storage (90% cheaper)
- **Query performance**: 10x faster

## Verification

### Check Migration Success

```sql
-- Count base64 screenshots remaining
SELECT COUNT(*) 
FROM tests 
WHERE screenshots::text LIKE '%data:image%';

-- Should return 0 or very few (only failed migrations)
```

### Check Storage Usage

```sql
-- Count migrated screenshots
SELECT COUNT(*) 
FROM tests 
WHERE screenshots::text LIKE '%supabase.co/storage%';
```

### Verify in Supabase Dashboard

1. Go to **Storage** > **test-screenshots**
2. Check file count matches migrated screenshots
3. Verify files are accessible

## Rollback (If Needed)

If you need to rollback:

1. **Stop using the new code** - revert to base64 encoding
2. **Keep storage files** - they're not hurting anything
3. **Database still has URLs** - old code won't display them

To fully rollback:
```sql
-- This would require re-encoding images to base64
-- Not recommended - better to fix forward
```

## Troubleshooting

### "Missing required environment variables"

**Solution**: Set environment variables:
```bash
export NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
export SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

### "Failed to upload screenshot"

**Possible causes**:
- Storage policies not set up correctly
- Service role key incorrect
- Bucket doesn't exist
- Network issues

**Solution**: Check storage setup in `SUPABASE_STORAGE_SETUP.md`

### "Invalid base64 format"

**Cause**: Screenshot data is corrupted or not valid base64

**Solution**: These screenshots are skipped and remain as-is

### Out of Memory

**Cause**: Processing too many large screenshots at once

**Solution**: Reduce batch size:
```bash
tsx scripts/migrate-base64-to-storage.ts --batch-size=10
```

## Performance Tips

1. **Run during off-hours**: Migration can be resource-intensive
2. **Monitor storage quota**: Ensure you have enough space
3. **Use appropriate batch size**: Balance speed vs memory
4. **Check network bandwidth**: Large uploads may take time

## Post-Migration

After successful migration:

1. **Verify screenshots display correctly** in your app
2. **Monitor storage usage** in Supabase dashboard
3. **Set up retention policy** (see `SCREENSHOT_RETENTION_POLICY.md`)
4. **Update documentation** to reflect new storage approach
5. **Consider deleting old base64 data** if migration was 100% successful

## FAQ

**Q: Can I run this multiple times?**
A: Yes! It's idempotent - already migrated screenshots are skipped.

**Q: What happens to failed migrations?**
A: They remain as base64 in the database. You can re-run to retry.

**Q: Will this affect my app while running?**
A: No - the app continues to work. Screenshots are updated atomically.

**Q: How long does it take?**
A: Depends on number of screenshots. ~1-2 seconds per screenshot.
   - 100 screenshots: ~2-3 minutes
   - 1000 screenshots: ~20-30 minutes

**Q: Can I cancel mid-migration?**
A: Yes! Press Ctrl+C. Already migrated screenshots remain migrated.

**Q: What if I have a huge database?**
A: Process in chunks by modifying the script's LIMIT or run multiple times.

## Support

If you encounter issues:
1. Check the error messages in the output
2. Verify storage setup is correct
3. Try dry-run mode first
4. Reduce batch size if memory issues
5. Check Supabase dashboard for storage errors
