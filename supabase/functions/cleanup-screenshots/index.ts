// Supabase Edge Function to clean up screenshots older than 30 days
// Deploy with: supabase functions deploy cleanup-screenshots
// Schedule with: supabase functions schedule cleanup-screenshots --cron "0 2 * * *" (runs daily at 2am)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RETENTION_DAYS = 30;

Deno.serve(async (req) => {
  try {
    // Create Supabase client with service role
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    console.log(`Starting cleanup of screenshots older than ${RETENTION_DAYS} days...`);

    // Step 1: Find test runs older than retention period
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - RETENTION_DAYS);

    const { data: oldTestRuns, error: testRunsError } = await supabase
      .from('test_runs')
      .select('id, timestamp')
      .lt('timestamp', cutoffDate.toISOString());

    if (testRunsError) {
      throw testRunsError;
    }

    console.log(`Found ${oldTestRuns?.length || 0} old test runs`);

    if (!oldTestRuns || oldTestRuns.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'No old test runs to clean up',
          deletedFiles: 0,
        }),
        { headers: { 'Content-Type': 'application/json' } }
      );
    }

    const testRunIds = oldTestRuns.map(tr => tr.id);

    // Step 2: Get all tests with screenshots from these runs
    const { data: testsWithScreenshots, error: testsError } = await supabase
      .from('tests')
      .select('id, screenshots')
      .in('test_run_id', testRunIds)
      .not('screenshots', 'is', null);

    if (testsError) {
      throw testsError;
    }

    console.log(`Found ${testsWithScreenshots?.length || 0} tests with screenshots`);

    // Step 3: Extract all screenshot URLs and delete from storage
    let deletedCount = 0;
    const errors: string[] = [];

    for (const test of testsWithScreenshots || []) {
      if (!test.screenshots || test.screenshots.length === 0) continue;

      for (const screenshotUrl of test.screenshots) {
        try {
          // Extract storage path from signed URL
          // Format: https://{project}.supabase.co/storage/v1/object/sign/test-screenshots/{path}?token=...
          const urlMatch = screenshotUrl.match(/test-screenshots\/(.+?)(\?|$)/);
          
          if (urlMatch && urlMatch[1]) {
            const storagePath = urlMatch[1];
            
            const { error: deleteError } = await supabase.storage
              .from('test-screenshots')
              .remove([storagePath]);

            if (deleteError) {
              console.error(`Failed to delete ${storagePath}:`, deleteError);
              errors.push(`${storagePath}: ${deleteError.message}`);
            } else {
              deletedCount++;
              console.log(`Deleted: ${storagePath}`);
            }
          }
        } catch (err) {
          console.error('Error processing screenshot:', err);
          errors.push(`${screenshotUrl}: ${err.message}`);
        }
      }
    }

    // Step 4: Clear screenshot references from database
    const { error: updateError } = await supabase
      .from('tests')
      .update({ screenshots: null })
      .in('test_run_id', testRunIds);

    if (updateError) {
      console.error('Failed to clear screenshot references:', updateError);
      errors.push(`Database update: ${updateError.message}`);
    }

    // Step 5: Also clean up test_results screenshots
    const { data: testResults, error: testResultsError } = await supabase
      .from('test_results')
      .select('id, screenshots, test_id')
      .in('test_id', (testsWithScreenshots || []).map(t => t.id))
      .not('screenshots', 'is', null);

    if (!testResultsError && testResults) {
      for (const result of testResults) {
        if (!result.screenshots || result.screenshots.length === 0) continue;

        for (const screenshotUrl of result.screenshots) {
          try {
            const urlMatch = screenshotUrl.match(/test-screenshots\/(.+?)(\?|$)/);
            
            if (urlMatch && urlMatch[1]) {
              const storagePath = urlMatch[1];
              
              const { error: deleteError } = await supabase.storage
                .from('test-screenshots')
                .remove([storagePath]);

              if (!deleteError) {
                deletedCount++;
              }
            }
          } catch (err) {
            console.error('Error processing test result screenshot:', err);
          }
        }
      }

      // Clear test_results screenshot references
      await supabase
        .from('test_results')
        .update({ screenshots: null })
        .in('test_id', (testsWithScreenshots || []).map(t => t.id));
    }

    console.log(`Cleanup complete. Deleted ${deletedCount} files.`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Cleanup complete`,
        deletedFiles: deletedCount,
        testRunsCleaned: testRunIds.length,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Cleanup failed:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      { 
        status: 500,
        headers: { 'Content-Type': 'application/json' } 
      }
    );
  }
});
