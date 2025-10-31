-- Migration: Add function to aggregate test metrics in PostgreSQL
-- This enables efficient test aggregation without fetching large datasets

CREATE OR REPLACE FUNCTION aggregate_test_metrics(
    p_project_ids UUID[],
    p_start_date TIMESTAMPTZ,
    p_environment_id UUID DEFAULT NULL,
    p_trigger_id UUID DEFAULT NULL
)
RETURNS TABLE (
    suite_test_id UUID,
    name TEXT,
    file TEXT,
    total_runs BIGINT,
    passed BIGINT,
    failed BIGINT,
    flaky BIGINT,
    skipped BIGINT,
    total_duration BIGINT,
    recent_statuses JSONB
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        st.id as suite_test_id,
        st.name,
        st.file,
        COUNT(t.id) as total_runs,
        COUNT(t.id) FILTER (WHERE t.status = 'passed') as passed,
        COUNT(t.id) FILTER (WHERE t.status = 'failed') as failed,
        COUNT(t.id) FILTER (WHERE t.status = 'flaky') as flaky,
        COUNT(t.id) FILTER (WHERE t.status = 'skipped') as skipped,
        COALESCE(SUM(t.duration), 0) as total_duration,
        COALESCE(
            JSONB_AGG(
                JSONB_BUILD_OBJECT(
                    'status', t.status,
                    'started_at', t.started_at
                ) ORDER BY t.started_at DESC
            ) FILTER (WHERE t.started_at IS NOT NULL),
            '[]'::jsonb
        ) as recent_statuses
    FROM tests t
    INNER JOIN test_runs tr ON t.test_run_id = tr.id
    INNER JOIN suite_tests st ON t.suite_test_id = st.id
    WHERE 
        tr.project_id = ANY(p_project_ids)
        AND tr.timestamp >= p_start_date
        AND (p_environment_id IS NULL OR tr.environment_id = p_environment_id)
        AND (p_trigger_id IS NULL OR tr.trigger_id = p_trigger_id)
        AND t.suite_test_id IS NOT NULL
    GROUP BY st.id, st.name, st.file
    ORDER BY (COUNT(t.id) FILTER (WHERE t.status = 'failed') * 2 + 
              COUNT(t.id) FILTER (WHERE t.status = 'flaky')) DESC;
END;
$$ LANGUAGE plpgsql;

-- Add comment
COMMENT ON FUNCTION aggregate_test_metrics IS 'Aggregates test metrics by suite_test_id for efficient test analytics';
