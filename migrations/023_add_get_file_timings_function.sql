-- Migration: Add function to compute per-file test timings for balanced Playwright sharding
-- This enables CI to pack spec files into shards by expected duration instead of file count

CREATE OR REPLACE FUNCTION get_file_timings(
    p_suite_id UUID,
    p_start_date TIMESTAMPTZ,
    p_environment_id UUID DEFAULT NULL,
    p_trigger_id UUID DEFAULT NULL
)
RETURNS TABLE (
    file TEXT,
    expected_duration_ms BIGINT,
    sample_size BIGINT
) AS $$
BEGIN
    RETURN QUERY
    WITH per_test AS (
        SELECT
            st.file,
            st.id,
            AVG(t.duration) AS mean_duration,
            COUNT(*) AS n
        FROM tests t
        INNER JOIN test_runs tr ON t.test_run_id = tr.id
        INNER JOIN suite_tests st ON t.suite_test_id = st.id
        WHERE
            tr.suite_id = p_suite_id
            AND tr.timestamp >= p_start_date
            AND (p_environment_id IS NULL OR tr.environment_id = p_environment_id)
            AND (p_trigger_id IS NULL OR tr.trigger_id = p_trigger_id)
            AND t.duration > 0
        GROUP BY st.file, st.id
    )
    SELECT
        per_test.file,
        ROUND(SUM(per_test.mean_duration))::BIGINT AS expected_duration_ms,
        SUM(per_test.n)::BIGINT AS sample_size
    FROM per_test
    GROUP BY per_test.file
    ORDER BY 2 DESC;
END;
$$ LANGUAGE plpgsql;

CREATE INDEX IF NOT EXISTS idx_test_runs_suite_id_timestamp
    ON public.test_runs(suite_id, timestamp DESC);

-- Add comment
COMMENT ON FUNCTION get_file_timings IS 'Computes expected per-file test duration (mean of retry-summed durations, summed per file) for duration-balanced Playwright sharding';
