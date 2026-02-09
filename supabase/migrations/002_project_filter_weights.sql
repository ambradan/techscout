-- ============================================================
-- Migration: Add project_filter_weights table for learning loop
--
-- This table stores calibrated weights for pre-filter scoring.
-- Weights are adjusted based on user feedback:
-- - NOT_RELEVANT: decrease weight
-- - USEFUL/ADOPTED: increase weight
-- ============================================================

-- Filter weight types: category, source, technology
CREATE TYPE filter_weight_type AS ENUM ('category', 'source', 'technology');

-- Main table for storing calibrated filter weights
CREATE TABLE project_filter_weights (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  -- Weight identification
  weight_type filter_weight_type NOT NULL,
  weight_key VARCHAR(255) NOT NULL, -- e.g., 'frontend', 'hacker_news', 'react'

  -- Weight value (1.0 = neutral, > 1.0 = boost, < 1.0 = reduce)
  weight DECIMAL(5,3) NOT NULL DEFAULT 1.0,

  -- Feedback counts for calibration
  useful_count INTEGER NOT NULL DEFAULT 0,
  adopted_count INTEGER NOT NULL DEFAULT 0,
  not_relevant_count INTEGER NOT NULL DEFAULT 0,

  -- Audit
  last_feedback_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Unique constraint per project/type/key
  CONSTRAINT unique_project_weight UNIQUE (project_id, weight_type, weight_key)
);

-- Indexes for efficient queries
CREATE INDEX idx_filter_weights_project ON project_filter_weights(project_id);
CREATE INDEX idx_filter_weights_type ON project_filter_weights(weight_type);
CREATE INDEX idx_filter_weights_key ON project_filter_weights(weight_key);

-- Enable RLS
ALTER TABLE project_filter_weights ENABLE ROW LEVEL SECURITY;

-- RLS policy: project owner can manage weights
CREATE POLICY project_filter_weights_policy ON project_filter_weights
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = project_filter_weights.project_id
      AND projects.owner_id = auth.uid()
    )
  );

-- Trigger to update updated_at
CREATE TRIGGER update_filter_weights_updated_at
  BEFORE UPDATE ON project_filter_weights
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Add comment
COMMENT ON TABLE project_filter_weights IS 'Calibrated filter weights based on user feedback for learning loop';
COMMENT ON COLUMN project_filter_weights.weight IS 'Multiplier: 1.0=neutral, >1.0=boost, <1.0=reduce';
