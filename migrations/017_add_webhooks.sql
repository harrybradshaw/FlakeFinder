-- Migration: Add webhook configuration and delivery tracking
-- This enables notifications to Slack, Teams, Discord, etc.

-- Webhook configurations per organization/project
CREATE TABLE IF NOT EXISTS webhook_configurations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE, -- NULL = all projects in org
  name VARCHAR(255) NOT NULL,
  webhook_type VARCHAR(50) NOT NULL, -- 'slack', 'teams', 'discord', 'generic'
  webhook_url TEXT NOT NULL,
  secret_key TEXT, -- For signature verification (optional)
  enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by VARCHAR(255),
  CONSTRAINT fk_organization FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_webhook_configs_org ON webhook_configurations(organization_id);
CREATE INDEX IF NOT EXISTS idx_webhook_configs_project ON webhook_configurations(project_id);
CREATE INDEX IF NOT EXISTS idx_webhook_configs_enabled ON webhook_configurations(enabled) WHERE enabled = TRUE;

-- Webhook trigger conditions
CREATE TABLE IF NOT EXISTS webhook_triggers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id UUID REFERENCES webhook_configurations(id) ON DELETE CASCADE,
  trigger_type VARCHAR(50) NOT NULL, -- 'test_failed', 'test_flaky', 'performance_regression', 'flakiness_threshold', 'run_failed'
  conditions JSONB, -- e.g., {"min_failures": 3, "flake_rate_threshold": 20, "branches": ["main", "develop"]}
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_triggers_webhook ON webhook_triggers(webhook_id);
CREATE INDEX IF NOT EXISTS idx_webhook_triggers_type ON webhook_triggers(trigger_type);

-- Webhook delivery log
CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_configuration_id UUID REFERENCES webhook_configurations(id) ON DELETE CASCADE,
  webhook_trigger_id UUID REFERENCES webhook_triggers(id) ON DELETE CASCADE,
  payload JSONB NOT NULL,
  status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'delivered', 'failed', 'retrying'
  response_code INTEGER,
  response_body TEXT,
  error_message TEXT,
  attempt_count INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  next_retry_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_config ON webhook_deliveries(webhook_configuration_id);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_trigger ON webhook_deliveries(webhook_trigger_id);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_status ON webhook_deliveries(status);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_created ON webhook_deliveries(created_at);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_retry ON webhook_deliveries(next_retry_at) WHERE status = 'retrying';

-- Add comments for documentation
COMMENT ON TABLE webhook_configurations IS 'Webhook endpoints configured per organization/project';
COMMENT ON TABLE webhook_triggers IS 'Conditions that trigger webhook notifications';
COMMENT ON TABLE webhook_deliveries IS 'Log of all webhook delivery attempts';

COMMENT ON COLUMN webhook_configurations.webhook_type IS 'Type of webhook: slack, teams, discord, or generic';
COMMENT ON COLUMN webhook_configurations.secret_key IS 'Optional secret for HMAC signature verification';
COMMENT ON COLUMN webhook_triggers.conditions IS 'JSON conditions for when to trigger (e.g., branch filters, thresholds)';
COMMENT ON COLUMN webhook_deliveries.payload IS 'The JSON payload sent to the webhook';
COMMENT ON COLUMN webhook_deliveries.next_retry_at IS 'When to retry failed deliveries (exponential backoff)';

-- Enable Row Level Security
ALTER TABLE webhook_configurations ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_triggers ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_deliveries ENABLE ROW LEVEL SECURITY;

-- Create policies to allow all operations (consistent with other tables)
CREATE POLICY "Allow all operations on webhook_configurations" ON webhook_configurations
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all operations on webhook_triggers" ON webhook_triggers
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all operations on webhook_deliveries" ON webhook_deliveries
    FOR ALL USING (true) WITH CHECK (true);
