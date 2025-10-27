-- Migration: Remove duplicate foreign key constraint on webhook_configurations
-- The table has both an implicit FK (from REFERENCES in column definition) 
-- and an explicit named constraint, causing ambiguity in Supabase queries

-- Drop the duplicate named constraint
ALTER TABLE webhook_configurations 
DROP CONSTRAINT IF EXISTS fk_organization;

-- The implicit foreign key constraint created by the REFERENCES clause remains
-- This is sufficient and follows PostgreSQL best practices
