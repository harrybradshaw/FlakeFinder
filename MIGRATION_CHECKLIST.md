# Screenshot Storage Migration Checklist

Complete checklist for migrating from base64 screenshots to Supabase Storage.

## ✅ Pre-Migration Setup

### 1. Create Supabase Storage Bucket
- [ ] Go to Supabase Dashboard > Storage
- [ ] Create bucket named `test-screenshots`
- [ ] Set as **Private** bucket
- [ ] Configure file size limit (50MB recommended)
- [ ] Set allowed MIME types: `image/png, image/jpeg, image/jpg`

### 2. Set Up Storage Policies
- [ ] Create INSERT policy for service role
- [ ] Create SELECT policy for service role  
- [ ] Create DELETE policy for service role
- [ ] Verify policies with `scripts/setup-storage.sql`

### 3. Configure Environment Variables
- [ ] Add `NEXT_PUBLIC_SUPABASE_URL` to `.env.local`
- [ ] Add `SUPABASE_ANON_KEY` to `.env.local`
- [ ] Add `SUPABASE_SERVICE_ROLE_KEY` to `.env.local`
- [ ] Verify variables are loaded: `echo $SUPABASE_SERVICE_ROLE_KEY`

### 4. Test Storage Upload
- [ ] Upload a new test report
- [ ] Verify screenshot uploads to storage
- [ ] Check console logs for "Uploaded screenshot to Supabase Storage"
- [ ] Verify screenshot displays correctly in UI

## 🔄 Migration Process

### 1. Dry Run
```bash
pnpm migrate:screenshots:dry-run
```
- [ ] Review output for number of screenshots to migrate
- [ ] Check for any errors or warnings
- [ ] Verify batch size is appropriate
- [ ] Confirm storage has enough space

### 2. Backup (Optional but Recommended)
```bash
# Backup your database
pg_dump $DATABASE_URL > backup-before-migration.sql
```
- [ ] Create database backup
- [ ] Store backup in safe location
- [ ] Verify backup is complete

### 3. Run Migration
```bash
pnpm migrate:screenshots
```
- [ ] Monitor progress in console
- [ ] Watch for errors
- [ ] Note any failed screenshots
- [ ] Wait for completion

### 4. Verify Migration
```sql
-- Check remaining base64 screenshots
SELECT COUNT(*) 
FROM tests 
WHERE screenshots::text LIKE '%data:image%';
-- Should be 0 or very few
```
- [ ] Run verification query
- [ ] Check Supabase Storage dashboard for files
- [ ] Verify screenshots display in app
- [ ] Test a few test detail pages

### 5. Handle Errors (If Any)
- [ ] Review error messages
- [ ] Re-run migration for failed screenshots
- [ ] Manually fix problematic screenshots if needed
- [ ] Document any permanent failures

## 🧹 Post-Migration

### 1. Set Up Retention Policy
```bash
# Deploy cleanup function
supabase functions deploy cleanup-screenshots

# Schedule daily cleanup
supabase functions schedule cleanup-screenshots --cron "0 2 * * *"
```
- [ ] Deploy cleanup Edge Function
- [ ] Schedule automatic cleanup
- [ ] Test cleanup function manually
- [ ] Monitor first few runs

### 2. Monitor Storage Usage
- [ ] Check Supabase Storage dashboard
- [ ] Set up usage alerts (80% threshold)
- [ ] Monitor costs
- [ ] Verify cleanup is working

### 3. Update Documentation
- [ ] Update team wiki/docs
- [ ] Note new storage approach
- [ ] Document retention policy
- [ ] Share migration results

### 4. Clean Up (Optional)
After confirming everything works for a few days:
- [ ] Remove old base64 screenshots from database (if 100% migrated)
- [ ] Archive migration scripts
- [ ] Update monitoring dashboards

## 📊 Success Metrics

Track these metrics before and after:

### Before Migration
- [ ] Database size: _______ GB
- [ ] Average query time: _______ ms
- [ ] Storage cost: $_______ /month
- [ ] Number of base64 screenshots: _______

### After Migration
- [ ] Database size: _______ GB (should be smaller)
- [ ] Average query time: _______ ms (should be faster)
- [ ] Storage cost: $_______ /month (should be cheaper)
- [ ] Number of screenshots in storage: _______
- [ ] Migration success rate: _______ %

## 🚨 Rollback Plan

If something goes wrong:

1. **Stop new uploads**
   - [ ] Revert code to use base64 encoding
   - [ ] Deploy rollback

2. **Assess damage**
   - [ ] Check what was migrated
   - [ ] Verify data integrity
   - [ ] Identify issues

3. **Restore if needed**
   - [ ] Restore from backup
   - [ ] Re-run migration with fixes
   - [ ] Test thoroughly

## 📝 Notes

Use this space to track your specific migration:

**Migration Date**: _______________

**Team Members**: _______________

**Issues Encountered**:
- 
- 
- 

**Lessons Learned**:
- 
- 
- 

**Follow-up Actions**:
- [ ] 
- [ ] 
- [ ] 

## 🎉 Completion

- [ ] All screenshots migrated successfully
- [ ] Storage policies configured
- [ ] Retention policy active
- [ ] Monitoring in place
- [ ] Documentation updated
- [ ] Team notified

**Migration completed on**: _______________

**Signed off by**: _______________
