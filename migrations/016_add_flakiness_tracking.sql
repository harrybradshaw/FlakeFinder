-- Migration: Add flakiness and performance tracking tables
-- This enables tracking test flakiness rates and performance metrics over time

-- Track daily test-level statistics
CREATE TABLE IF NOT EXISTS test_flakiness_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  suite_test_id UUID REFERENCES suite_tests(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  total_runs INTEGER DEFAULT 0,
  flaky_runs INTEGER DEFAULT 0,
  failed_runs INTEGER DEFAULT 0,
  passed_runs INTEGER DEFAULT 0,
  flake_rate DECIMAL(5,2), -- percentage (0-100)
  avg_duration INTEGER, -- milliseconds
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(suite_test_id, date)
);

-- Index for efficient queries
CREATE INDEX IF NOT EXISTS idx_flakiness_metrics_suite_test ON test_flakiness_metrics(suite_test_id);
CREATE INDEX IF NOT EXISTS idx_flakiness_metrics_date ON test_flakiness_metrics(date);
CREATE INDEX IF NOT EXISTS idx_flakiness_metrics_suite_test_date ON test_flakiness_metrics(suite_test_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_flakiness_metrics_flake_rate ON test_flakiness_metrics(flake_rate) WHERE flake_rate > 0;

-- Track when tests cross flakiness thresholds
CREATE TABLE IF NOT EXISTS flakiness_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  suite_test_id UUID REFERENCES suite_tests(id) ON DELETE CASCADE,
  alert_type VARCHAR(50) NOT NULL, -- 'threshold_exceeded', 'consecutive_flaky', 'new_flaky'
  flake_rate DECIMAL(5,2),
  threshold DECIMAL(5,2),
  consecutive_count INTEGER, -- for consecutive_flaky type
  metadata JSONB, -- additional context
  triggered_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_flakiness_alerts_suite_test ON flakiness_alerts(suite_test_id);
CREATE INDEX IF NOT EXISTS idx_flakiness_alerts_triggered ON flakiness_alerts(triggered_at);

-- Track performance metrics for anomaly detection
CREATE TABLE IF NOT EXISTS test_performance_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  suite_test_id UUID REFERENCES suite_tests(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  avg_duration INTEGER, -- milliseconds
  p50_duration INTEGER, -- median
  p90_duration INTEGER,
  p95_duration INTEGER,
  p99_duration INTEGER,
  std_deviation DECIMAL(10,2),
  sample_size INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(suite_test_id, date)
);

CREATE INDEX IF NOT EXISTS idx_performance_metrics_suite_test ON test_performance_metrics(suite_test_id);
CREATE INDEX IF NOT EXISTS idx_performance_metrics_date ON test_performance_metrics(date);

-- Track performance anomalies
CREATE TABLE IF NOT EXISTS performance_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  suite_test_id UUID REFERENCES suite_tests(id) ON DELETE CASCADE,
  test_run_id UUID REFERENCES test_runs(id) ON DELETE CASCADE,
  test_id UUID REFERENCES tests(id) ON DELETE CASCADE,
  alert_type VARCHAR(50) NOT NULL, -- 'duration_spike', 'duration_regression'
  current_duration INTEGER,
  baseline_duration INTEGER,
  deviation_percent DECIMAL(5,2),
  metadata JSONB,
  triggered_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_performance_alerts_suite_test ON performance_alerts(suite_test_id);
CREATE INDEX IF NOT EXISTS idx_performance_alerts_test_run ON performance_alerts(test_run_id);
CREATE INDEX IF NOT EXISTS idx_performance_alerts_triggered ON performance_alerts(triggered_at);

-- Add comments for documentation
COMMENT ON TABLE test_flakiness_metrics IS 'Daily aggregated flakiness statistics per test';
COMMENT ON TABLE flakiness_alerts IS 'Alerts triggered when tests exceed flakiness thresholds';
COMMENT ON TABLE test_performance_metrics IS 'Daily performance metrics for anomaly detection';
COMMENT ON TABLE performance_alerts IS 'Alerts triggered when test duration anomalies are detected';

COMMENT ON COLUMN test_flakiness_metrics.flake_rate IS 'Percentage of runs that were flaky (0-100)';
COMMENT ON COLUMN test_performance_metrics.std_deviation IS 'Standard deviation of test duration in milliseconds';
COMMENT ON COLUMN performance_alerts.deviation_percent IS 'Percentage deviation from baseline';
