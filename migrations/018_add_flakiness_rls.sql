-- Migration: Add RLS policies for flakiness tracking tables
-- Ensures proper access control for flakiness metrics, alerts, and performance data

-- Enable RLS on all flakiness tracking tables
ALTER TABLE test_flakiness_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE flakiness_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE test_performance_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE performance_alerts ENABLE ROW LEVEL SECURITY;

-- RLS Policies for test_flakiness_metrics
CREATE POLICY "Allow all operations on test_flakiness_metrics"
  ON test_flakiness_metrics
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- RLS Policies for flakiness_alerts
CREATE POLICY "Allow all operations on flakiness_alerts"
  ON flakiness_alerts
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- RLS Policies for test_performance_metrics
CREATE POLICY "Allow all operations on test_performance_metrics"
  ON test_performance_metrics
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- RLS Policies for performance_alerts
CREATE POLICY "Allow all operations on performance_alerts"
  ON performance_alerts
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Add comments
COMMENT ON POLICY "Allow all operations on test_flakiness_metrics" ON test_flakiness_metrics IS 
  'Allow all operations on flakiness metrics';

COMMENT ON POLICY "Allow all operations on flakiness_alerts" ON flakiness_alerts IS 
  'Allow all operations on flakiness alerts';

COMMENT ON POLICY "Allow all operations on test_performance_metrics" ON test_performance_metrics IS 
  'Allow all operations on performance metrics';

COMMENT ON POLICY "Allow all operations on performance_alerts" ON performance_alerts IS 
  'Allow all operations on performance alerts';
