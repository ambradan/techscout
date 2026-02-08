-- ============================================================
-- TechScout Database Schema v1.0
-- Migration: 20260208000000_initial_schema
-- ============================================================
-- Creates all tables for the TechScout platform.
-- Derived from YAML schemas in architecture/ directory.
-- RLS enabled on all tables with owner_id-based policies.
-- ============================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- For fuzzy text search

-- ============================================================
-- ENUM TYPES
-- ============================================================

-- Project phase
CREATE TYPE project_phase AS ENUM (
  'mvp',
  'growth',
  'scale',
  'maintenance',
  'legacy'
);

-- Team member roles
CREATE TYPE team_role AS ENUM (
  'developer_frontend',
  'developer_backend',
  'developer_fullstack',
  'pm',
  'stakeholder',
  'other'
);

-- Scouting frequency
CREATE TYPE scouting_frequency AS ENUM (
  'daily',
  'weekly',
  'biweekly',
  'monthly'
);

-- Provider types
CREATE TYPE source_provider AS ENUM (
  'github',
  'gitlab',
  'bitbucket',
  'railway',
  'vercel',
  'local_upload',
  'cli_local',
  'manual_manifest'
);

-- Connection types
CREATE TYPE connection_type AS ENUM (
  'oauth',
  'token',
  'none'
);

-- Language role in stack
CREATE TYPE language_role AS ENUM (
  'primary',
  'secondary',
  'config',
  'scripting'
);

-- Framework category
CREATE TYPE framework_category AS ENUM (
  'frontend',
  'backend',
  'styling',
  'testing',
  'build',
  'other'
);

-- Dependency ecosystem
CREATE TYPE dependency_ecosystem AS ENUM (
  'npm',
  'pip',
  'cargo',
  'go',
  'maven',
  'nuget',
  'gems',
  'other'
);

-- CF finding severity
CREATE TYPE cf_severity AS ENUM (
  'critical',
  'high',
  'medium',
  'low'
);

-- IFX tag types
CREATE TYPE ifx_tag AS ENUM (
  'FACT',
  'INFERENCE',
  'ASSUMPTION'
);

-- KQR reliability levels
CREATE TYPE kqr_reliability AS ENUM (
  'very_high',
  'high',
  'medium',
  'low'
);

-- Feed item source tier
CREATE TYPE feed_source_tier AS ENUM (
  'tier1_high_signal',
  'tier2_curated',
  'tier3_community',
  'conditional'
);

-- Recommendation type
CREATE TYPE recommendation_type AS ENUM (
  'recommendation',
  'breaking_change_alert'
);

-- Recommendation action
CREATE TYPE recommendation_action AS ENUM (
  'REPLACE_EXISTING',
  'COMPLEMENT',
  'NEW_CAPABILITY',
  'MONITOR'
);

-- Recommendation priority
CREATE TYPE recommendation_priority AS ENUM (
  'critical',
  'high',
  'medium',
  'low',
  'info'
);

-- Subject type
CREATE TYPE subject_type AS ENUM (
  'library',
  'framework',
  'platform',
  'tool',
  'service',
  'pattern',
  'practice'
);

-- Subject maturity
CREATE TYPE subject_maturity AS ENUM (
  'experimental',
  'growth',
  'stable',
  'declining',
  'deprecated'
);

-- Risk level
CREATE TYPE risk_level AS ENUM (
  'none',
  'low',
  'medium',
  'high',
  'critical'
);

-- Reversibility level
CREATE TYPE reversibility AS ENUM (
  'easy',
  'medium',
  'hard',
  'irreversible'
);

-- Stability verdict
CREATE TYPE stability_verdict AS ENUM (
  'RECOMMEND',
  'MONITOR',
  'DEFER'
);

-- Feedback status
CREATE TYPE feedback_status AS ENUM (
  'pending',
  'useful',
  'not_relevant',
  'already_knew',
  'adopted',
  'dismissed'
);

-- Breaking change alert type
CREATE TYPE alert_type AS ENUM (
  'major_version',
  'deprecation_notice',
  'security_advisory',
  'eol_announcement'
);

-- Migration job status
CREATE TYPE migration_status AS ENUM (
  'pending',
  'backing_up',
  'planning',
  'awaiting_plan_approval',
  'executing',
  'testing',
  'reporting',
  'awaiting_review',
  'approved',
  'merged',
  'rejected',
  'failed',
  'safety_stopped',
  'timeout'
);

-- Human review status
CREATE TYPE review_status AS ENUM (
  'pending',
  'approved',
  'rejected',
  'changes_requested'
);

-- Audit action type
CREATE TYPE audit_action AS ENUM (
  'preflight_start',
  'preflight_complete',
  'preflight_failed',
  'branch_created',
  'backup_committed',
  'plan_generated',
  'plan_approved',
  'plan_rejected',
  'execution_start',
  'step_completed',
  'step_failed',
  'ambiguity_detected',
  'execution_complete',
  'tests_complete',
  'tests_failed',
  'safety_stop',
  'pr_opened',
  'pr_approved',
  'pr_merged',
  'pr_rejected'
);

-- ============================================================
-- PROJECTS TABLE
-- ============================================================

CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id UUID NOT NULL, -- References auth.users
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Scouting configuration (frequently queried)
  scouting_enabled BOOLEAN NOT NULL DEFAULT true,
  scouting_frequency scouting_frequency NOT NULL DEFAULT 'weekly',
  max_recommendations INTEGER NOT NULL DEFAULT 5,
  focus_areas TEXT[] DEFAULT '{}',
  exclude_categories TEXT[] DEFAULT '{}',

  -- Breaking changes configuration
  breaking_changes_enabled BOOLEAN NOT NULL DEFAULT true,
  breaking_changes_alerts TEXT[] DEFAULT ARRAY['major_version', 'deprecation_notice', 'security_advisory', 'eol_announcement'],
  breaking_changes_delivery VARCHAR(20) DEFAULT 'immediate',

  -- Export configuration
  export_enabled BOOLEAN NOT NULL DEFAULT true,
  export_formats TEXT[] DEFAULT ARRAY['pdf', 'json'],
  export_frequency VARCHAR(50) DEFAULT 'after_each_brief',
  export_retention_days INTEGER DEFAULT 365,

  -- Agent configuration (stored as JSONB for flexibility)
  agent_config JSONB DEFAULT '{"enabled": false, "mode": "assisted"}',

  -- Notification channels (JSONB array)
  notification_channels JSONB DEFAULT '[]',

  CONSTRAINT unique_owner_slug UNIQUE (owner_id, slug)
);

CREATE INDEX idx_projects_owner ON projects(owner_id);
CREATE INDEX idx_projects_scouting_enabled ON projects(scouting_enabled) WHERE scouting_enabled = true;

-- ============================================================
-- PROJECT_SOURCES TABLE
-- ============================================================

CREATE TABLE project_sources (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  provider source_provider NOT NULL,
  connection_type connection_type NOT NULL,
  connection_config JSONB NOT NULL DEFAULT '{}', -- repos, tokens, project_ids, etc.
  last_scan TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_project_sources_project ON project_sources(project_id);
CREATE INDEX idx_project_sources_provider ON project_sources(provider);

-- ============================================================
-- PROJECT_TEAM TABLE
-- ============================================================

CREATE TABLE project_team (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL, -- References auth.users
  name VARCHAR(255) NOT NULL,
  role team_role NOT NULL,
  receives_technical_brief BOOLEAN NOT NULL DEFAULT true,
  receives_human_brief BOOLEAN NOT NULL DEFAULT true,
  notification_channel VARCHAR(50) DEFAULT 'email',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT unique_project_user UNIQUE (project_id, user_id)
);

CREATE INDEX idx_project_team_project ON project_team(project_id);
CREATE INDEX idx_project_team_user ON project_team(user_id);

-- ============================================================
-- PROJECT_STACK TABLE
-- Normalized stack information extracted from sources
-- ============================================================

CREATE TABLE project_stack (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE UNIQUE,

  -- Languages (JSONB array)
  languages JSONB NOT NULL DEFAULT '[]',
  -- Example: [{"name": "TypeScript", "percentage": 62.3, "role": "primary"}]

  -- Frameworks (JSONB array)
  frameworks JSONB NOT NULL DEFAULT '[]',
  -- Example: [{"name": "Next.js", "version": "14.2.1", "category": "frontend"}]

  -- Databases (JSONB array)
  databases JSONB NOT NULL DEFAULT '[]',

  -- Infrastructure (JSONB object)
  infrastructure JSONB NOT NULL DEFAULT '{}',

  -- Key dependencies (JSONB array) - important deps for matching
  key_dependencies JSONB NOT NULL DEFAULT '[]',

  -- All dependencies summary (JSONB object)
  all_dependencies JSONB NOT NULL DEFAULT '{}',
  -- Example: {"npm": {"direct": 47, "dev": 23}, "pip": {"direct": 18}}

  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_project_stack_project ON project_stack(project_id);
-- GIN index for JSONB queries on key_dependencies
CREATE INDEX idx_project_stack_key_deps ON project_stack USING GIN (key_dependencies);

-- ============================================================
-- PROJECT_MANIFEST TABLE
-- User-provided project context
-- ============================================================

CREATE TABLE project_manifest (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE UNIQUE,

  phase project_phase NOT NULL DEFAULT 'growth',
  description TEXT,

  -- Arrays stored as TEXT[] for efficient querying
  objectives TEXT[] DEFAULT '{}',
  pain_points TEXT[] DEFAULT '{}',
  constraints TEXT[] DEFAULT '{}',
  open_to TEXT[] DEFAULT '{}',
  not_open_to TEXT[] DEFAULT '{}',

  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_project_manifest_project ON project_manifest(project_id);
CREATE INDEX idx_project_manifest_phase ON project_manifest(phase);
-- GIN indexes for array contains queries
CREATE INDEX idx_project_manifest_pain_points ON project_manifest USING GIN (pain_points);

-- ============================================================
-- CF_FINDINGS TABLE
-- Code Forensics scan results
-- ============================================================

CREATE TABLE cf_findings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  -- Finding identity
  finding_id VARCHAR(50) NOT NULL, -- e.g., "CF-2026-001"
  layer VARCHAR(10) NOT NULL, -- e.g., "L1", "L2"
  category VARCHAR(50) NOT NULL, -- e.g., "crypto", "auth", "compliance"
  severity cf_severity NOT NULL,
  pattern_id VARCHAR(100), -- e.g., "CRYPTO-WEAK-HASH"

  -- Finding details
  description TEXT NOT NULL,
  files_affected INTEGER NOT NULL DEFAULT 0,
  ifx_tag ifx_tag NOT NULL DEFAULT 'FACT',

  -- Status
  is_resolved BOOLEAN NOT NULL DEFAULT false,
  resolved_by_recommendation UUID, -- References recommendations.id
  resolved_at TIMESTAMPTZ,

  -- Scan metadata
  scan_version VARCHAR(20),
  scanned_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT unique_project_finding UNIQUE (project_id, finding_id)
);

CREATE INDEX idx_cf_findings_project ON cf_findings(project_id);
CREATE INDEX idx_cf_findings_severity ON cf_findings(severity);
CREATE INDEX idx_cf_findings_unresolved ON cf_findings(project_id, is_resolved) WHERE is_resolved = false;
CREATE INDEX idx_cf_findings_category ON cf_findings(category);

-- ============================================================
-- STACK_HEALTH TABLE
-- Calculated health scores for Stability Gate
-- ============================================================

CREATE TABLE stack_health (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE UNIQUE,

  -- Overall score (0-1)
  overall_score DECIMAL(4,3) NOT NULL DEFAULT 0.5,

  -- Component scores (JSONB for flexibility)
  components JSONB NOT NULL DEFAULT '{}',
  -- Example: {"security": {"score": 0.55, "factors": [...]}, "freshness": {...}}

  last_calculated TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_stack_health_project ON stack_health(project_id);
CREATE INDEX idx_stack_health_score ON stack_health(overall_score);

-- ============================================================
-- COST_TRACKING TABLE
-- Historical adoption effort data for calibration
-- ============================================================

CREATE TABLE cost_tracking (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  recommendation_id UUID NOT NULL, -- Will reference recommendations

  subject VARCHAR(255) NOT NULL,
  estimated_days DECIMAL(5,2) NOT NULL,
  actual_days DECIMAL(5,2),
  notes TEXT,

  adopted_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_cost_tracking_project ON cost_tracking(project_id);

-- ============================================================
-- FEED_ITEMS TABLE
-- Normalized items from all feed sources
-- ============================================================

CREATE TABLE feed_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Source identification
  source_name VARCHAR(100) NOT NULL, -- e.g., "hacker_news", "github_trending"
  source_tier feed_source_tier NOT NULL,
  source_reliability kqr_reliability NOT NULL,
  external_id VARCHAR(255), -- ID from the source

  -- Content
  title TEXT NOT NULL,
  url TEXT,
  description TEXT,
  content_summary TEXT, -- AI-generated summary if applicable

  -- Metadata
  published_at TIMESTAMPTZ,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Classification (for pre-filtering)
  categories TEXT[] DEFAULT '{}',
  technologies TEXT[] DEFAULT '{}', -- Mentioned tech
  language_ecosystems TEXT[] DEFAULT '{}', -- npm, pip, cargo, etc.

  -- Traction signals (JSONB for flexibility)
  traction JSONB DEFAULT '{}',
  -- Example: {"points": 450, "comments": 123, "stars": 5000}

  -- Processing state
  is_processed BOOLEAN NOT NULL DEFAULT false,
  processed_at TIMESTAMPTZ,

  -- Deduplication
  content_hash VARCHAR(64), -- SHA-256 of normalized content

  CONSTRAINT unique_source_external UNIQUE (source_name, external_id)
);

CREATE INDEX idx_feed_items_source ON feed_items(source_name);
CREATE INDEX idx_feed_items_published ON feed_items(published_at DESC);
CREATE INDEX idx_feed_items_unprocessed ON feed_items(is_processed) WHERE is_processed = false;
CREATE INDEX idx_feed_items_technologies ON feed_items USING GIN (technologies);
CREATE INDEX idx_feed_items_categories ON feed_items USING GIN (categories);
CREATE INDEX idx_feed_items_content_hash ON feed_items(content_hash);

-- ============================================================
-- RECOMMENDATIONS TABLE
-- Output from the matching engine
-- ============================================================

CREATE TABLE recommendations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  feed_item_id UUID REFERENCES feed_items(id),

  -- Governance
  ifx_trace_id VARCHAR(50) NOT NULL UNIQUE,
  model_used VARCHAR(50) NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Type and classification
  type recommendation_type NOT NULL DEFAULT 'recommendation',
  action recommendation_action NOT NULL,
  priority recommendation_priority NOT NULL,
  confidence DECIMAL(4,3) NOT NULL,

  -- Subject (the thing being recommended)
  subject JSONB NOT NULL,
  -- Contains: name, type, url, version, ecosystem, license, maturity, traction

  -- What it affects in current stack
  replaces TEXT,
  complements TEXT,
  enables TEXT,

  -- Role visibility (who should see this)
  role_visibility team_role[] NOT NULL DEFAULT ARRAY['developer_fullstack', 'pm']::team_role[],

  -- Stability Assessment (JSONB - complex nested structure)
  stability_assessment JSONB NOT NULL,
  -- Contains: cost_of_change, cost_of_no_change, maturity_gate, stack_health_influence, verdict

  -- Technical analysis (JSONB)
  technical JSONB NOT NULL,
  -- Contains: analysis (facts, inferences, assumptions), effort, impact, tradeoffs, failure_modes, limitations

  -- Human-friendly output (JSONB)
  human_friendly JSONB NOT NULL,
  -- Contains: title, one_liner, summary, why_now, client_talking_points, impact_summary

  -- KQR qualification (JSONB)
  kqr JSONB NOT NULL,
  -- Contains: overall_confidence, sources_used, cross_validation, confidence_breakdown, qualification_statement

  -- Delivery state
  is_delivered BOOLEAN NOT NULL DEFAULT false,
  delivered_at TIMESTAMPTZ,
  delivery_channel VARCHAR(50),

  -- For breaking_change_alert type
  alert_type alert_type,
  alert_severity recommendation_priority,
  action_required VARCHAR(20), -- IMMEDIATE, PLAN, MONITOR

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_recommendations_project ON recommendations(project_id);
CREATE INDEX idx_recommendations_generated ON recommendations(generated_at DESC);
CREATE INDEX idx_recommendations_type ON recommendations(type);
CREATE INDEX idx_recommendations_priority ON recommendations(priority);
CREATE INDEX idx_recommendations_undelivered ON recommendations(project_id, is_delivered) WHERE is_delivered = false;
CREATE INDEX idx_recommendations_subject ON recommendations USING GIN (subject);

-- ============================================================
-- RECOMMENDATION_FEEDBACK TABLE
-- User feedback on recommendations
-- ============================================================

CREATE TABLE recommendation_feedback (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  recommendation_id UUID NOT NULL REFERENCES recommendations(id) ON DELETE CASCADE UNIQUE,

  -- Feedback
  status feedback_status NOT NULL DEFAULT 'pending',
  user_notes TEXT,
  submitted_by UUID, -- References auth.users
  submitted_at TIMESTAMPTZ,

  -- Cost tracking (populated if status = adopted)
  actual_days DECIMAL(5,2),
  actual_complexity VARCHAR(20), -- trivial, low, medium, high, very_high
  unexpected_issues TEXT,
  adoption_notes TEXT,
  adopted_at TIMESTAMPTZ,

  -- Post-adoption outcome
  adoption_outcome JSONB,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_recommendation_feedback_rec ON recommendation_feedback(recommendation_id);
CREATE INDEX idx_recommendation_feedback_status ON recommendation_feedback(status);
CREATE INDEX idx_recommendation_feedback_adopted ON recommendation_feedback(status) WHERE status = 'adopted';

-- ============================================================
-- MIGRATION_JOBS TABLE
-- Agent execution records
-- ============================================================

CREATE TABLE migration_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  recommendation_id UUID NOT NULL REFERENCES recommendations(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  -- Governance
  ifx_trace_id VARCHAR(50) NOT NULL UNIQUE,
  triggered_by UUID NOT NULL, -- References auth.users
  triggered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Status
  status migration_status NOT NULL DEFAULT 'pending',

  -- Preflight checks (JSONB)
  preflight JSONB,

  -- Backup info
  branch_name VARCHAR(255),
  created_from_sha VARCHAR(64),
  backup_commit_sha VARCHAR(64),

  -- Plan (for supervised mode)
  plan JSONB,
  plan_status review_status,
  plan_approved_by UUID,
  plan_approved_at TIMESTAMPTZ,

  -- Execution details (JSONB)
  execution JSONB,
  -- Contains: steps_executed, safety_checks, ambiguity_log, claude_code session info

  -- Testing results (JSONB)
  testing JSONB,

  -- Migration report (JSONB)
  report JSONB,

  -- PR info
  pr_url TEXT,
  pr_number INTEGER,
  pr_status review_status,

  -- Human review
  human_review_status review_status DEFAULT 'pending',
  reviewer UUID,
  reviewed_at TIMESTAMPTZ,
  review_comments TEXT,

  -- Post-merge
  merged_at TIMESTAMPTZ,
  merged_by UUID,
  merge_sha VARCHAR(64),

  -- Safety stop info
  safety_stopped BOOLEAN NOT NULL DEFAULT false,
  safety_stop_reason TEXT,
  safety_stop_at_step INTEGER,

  -- Timing
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  duration_minutes DECIMAL(10,2),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_migration_jobs_recommendation ON migration_jobs(recommendation_id);
CREATE INDEX idx_migration_jobs_project ON migration_jobs(project_id);
CREATE INDEX idx_migration_jobs_status ON migration_jobs(status);
CREATE INDEX idx_migration_jobs_pending ON migration_jobs(status) WHERE status IN ('pending', 'executing', 'awaiting_review');

-- ============================================================
-- AUDIT_LOG TABLE
-- Immutable log of all agent actions
-- ============================================================

CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  migration_job_id UUID REFERENCES migration_jobs(id) ON DELETE SET NULL,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,

  -- Action
  action audit_action NOT NULL,
  detail TEXT,

  -- Context
  actor UUID, -- User or system
  actor_type VARCHAR(20) NOT NULL DEFAULT 'agent', -- agent, user, system

  -- Timestamp (immutable)
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Additional metadata
  metadata JSONB DEFAULT '{}'
);

-- No UPDATE allowed on audit_log
CREATE INDEX idx_audit_log_job ON audit_log(migration_job_id);
CREATE INDEX idx_audit_log_project ON audit_log(project_id);
CREATE INDEX idx_audit_log_timestamp ON audit_log(timestamp DESC);
CREATE INDEX idx_audit_log_action ON audit_log(action);

-- ============================================================
-- BRIEF_ARCHIVE TABLE
-- Exported briefs (PDF, JSON)
-- ============================================================

CREATE TABLE brief_archive (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  -- Brief metadata
  brief_type VARCHAR(20) NOT NULL, -- 'technical', 'human_friendly', 'combined'
  format VARCHAR(20) NOT NULL, -- 'pdf', 'json', 'markdown'

  -- Content
  file_path TEXT, -- Path in Supabase Storage
  file_size_bytes INTEGER,

  -- Recommendations included
  recommendation_ids UUID[] DEFAULT '{}',
  recommendation_count INTEGER NOT NULL DEFAULT 0,

  -- Period covered
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,

  -- Delivery
  delivered_to TEXT[], -- Email addresses or Slack channels
  delivered_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ -- Based on retention_days
);

CREATE INDEX idx_brief_archive_project ON brief_archive(project_id);
CREATE INDEX idx_brief_archive_created ON brief_archive(created_at DESC);
CREATE INDEX idx_brief_archive_expires ON brief_archive(expires_at) WHERE expires_at IS NOT NULL;

-- ============================================================
-- GOVERNANCE METADATA TABLE
-- IFX/KQR versioning and validation
-- ============================================================

CREATE TABLE governance_metadata (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE UNIQUE,

  ifx_version VARCHAR(20) NOT NULL DEFAULT '1.0',
  kqr_version VARCHAR(20) NOT NULL DEFAULT '1.0',

  last_profile_validation TIMESTAMPTZ,
  profile_completeness_score DECIMAL(4,3) DEFAULT 0.0,

  -- Data sources used (JSONB array)
  data_sources_used JSONB DEFAULT '[]',

  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_governance_project ON governance_metadata(project_id);

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_team ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_stack ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_manifest ENABLE ROW LEVEL SECURITY;
ALTER TABLE cf_findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE stack_health ENABLE ROW LEVEL SECURITY;
ALTER TABLE cost_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE feed_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE recommendation_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE migration_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE brief_archive ENABLE ROW LEVEL SECURITY;
ALTER TABLE governance_metadata ENABLE ROW LEVEL SECURITY;

-- Projects: owner can do everything
CREATE POLICY projects_owner_policy ON projects
  FOR ALL USING (auth.uid() = owner_id);

-- Project sources: accessible by project owner
CREATE POLICY project_sources_policy ON project_sources
  FOR ALL USING (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = project_sources.project_id AND projects.owner_id = auth.uid())
  );

-- Project team: accessible by project owner or team members
CREATE POLICY project_team_owner_policy ON project_team
  FOR ALL USING (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = project_team.project_id AND projects.owner_id = auth.uid())
  );

CREATE POLICY project_team_member_policy ON project_team
  FOR SELECT USING (user_id = auth.uid());

-- Project stack: accessible by project owner
CREATE POLICY project_stack_policy ON project_stack
  FOR ALL USING (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = project_stack.project_id AND projects.owner_id = auth.uid())
  );

-- Project manifest: accessible by project owner
CREATE POLICY project_manifest_policy ON project_manifest
  FOR ALL USING (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = project_manifest.project_id AND projects.owner_id = auth.uid())
  );

-- CF findings: accessible by project owner
CREATE POLICY cf_findings_policy ON cf_findings
  FOR ALL USING (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = cf_findings.project_id AND projects.owner_id = auth.uid())
  );

-- Stack health: accessible by project owner
CREATE POLICY stack_health_policy ON stack_health
  FOR ALL USING (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = stack_health.project_id AND projects.owner_id = auth.uid())
  );

-- Cost tracking: accessible by project owner
CREATE POLICY cost_tracking_policy ON cost_tracking
  FOR ALL USING (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = cost_tracking.project_id AND projects.owner_id = auth.uid())
  );

-- Feed items: readable by all authenticated users (public feed data)
CREATE POLICY feed_items_read_policy ON feed_items
  FOR SELECT USING (auth.role() = 'authenticated');

-- Feed items: only service role can insert/update
CREATE POLICY feed_items_write_policy ON feed_items
  FOR INSERT WITH CHECK (auth.role() = 'service_role');

CREATE POLICY feed_items_update_policy ON feed_items
  FOR UPDATE USING (auth.role() = 'service_role');

-- Recommendations: accessible by project owner or team members
CREATE POLICY recommendations_policy ON recommendations
  FOR ALL USING (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = recommendations.project_id AND projects.owner_id = auth.uid())
    OR EXISTS (SELECT 1 FROM project_team WHERE project_team.project_id = recommendations.project_id AND project_team.user_id = auth.uid())
  );

-- Recommendation feedback: accessible by project owner or team members
CREATE POLICY recommendation_feedback_policy ON recommendation_feedback
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM recommendations r
      JOIN projects p ON p.id = r.project_id
      WHERE r.id = recommendation_feedback.recommendation_id
      AND (p.owner_id = auth.uid() OR EXISTS (
        SELECT 1 FROM project_team pt WHERE pt.project_id = p.id AND pt.user_id = auth.uid()
      ))
    )
  );

-- Migration jobs: accessible by project owner
CREATE POLICY migration_jobs_policy ON migration_jobs
  FOR ALL USING (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = migration_jobs.project_id AND projects.owner_id = auth.uid())
  );

-- Audit log: read-only for project owner, insert by service role
CREATE POLICY audit_log_read_policy ON audit_log
  FOR SELECT USING (
    project_id IS NULL
    OR EXISTS (SELECT 1 FROM projects WHERE projects.id = audit_log.project_id AND projects.owner_id = auth.uid())
  );

CREATE POLICY audit_log_insert_policy ON audit_log
  FOR INSERT WITH CHECK (auth.role() = 'service_role');

-- Brief archive: accessible by project owner
CREATE POLICY brief_archive_policy ON brief_archive
  FOR ALL USING (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = brief_archive.project_id AND projects.owner_id = auth.uid())
  );

-- Governance metadata: accessible by project owner
CREATE POLICY governance_metadata_policy ON governance_metadata
  FOR ALL USING (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = governance_metadata.project_id AND projects.owner_id = auth.uid())
  );

-- ============================================================
-- TRIGGERS
-- ============================================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_project_sources_updated_at
  BEFORE UPDATE ON project_sources
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_project_stack_updated_at
  BEFORE UPDATE ON project_stack
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_project_manifest_updated_at
  BEFORE UPDATE ON project_manifest
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_stack_health_updated_at
  BEFORE UPDATE ON stack_health
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_recommendation_feedback_updated_at
  BEFORE UPDATE ON recommendation_feedback
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_migration_jobs_updated_at
  BEFORE UPDATE ON migration_jobs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_governance_metadata_updated_at
  BEFORE UPDATE ON governance_metadata
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- COMMENTS (documentation in database)
-- ============================================================

COMMENT ON TABLE projects IS 'Main project entity with scouting configuration';
COMMENT ON TABLE project_sources IS 'Connected source providers (GitHub, GitLab, etc.)';
COMMENT ON TABLE project_team IS 'Team members with role-based delivery preferences';
COMMENT ON TABLE project_stack IS 'Normalized technology stack extracted from sources';
COMMENT ON TABLE project_manifest IS 'User-provided project context (objectives, pain points, constraints)';
COMMENT ON TABLE cf_findings IS 'Code Forensics security/quality findings';
COMMENT ON TABLE stack_health IS 'Calculated health scores for Stability Gate decisions';
COMMENT ON TABLE cost_tracking IS 'Historical effort data for estimate calibration';
COMMENT ON TABLE feed_items IS 'Normalized items from all technology intelligence sources';
COMMENT ON TABLE recommendations IS 'Matching engine output with IFX/KQR governance';
COMMENT ON TABLE recommendation_feedback IS 'User feedback and adoption tracking';
COMMENT ON TABLE migration_jobs IS 'Agent migration execution records';
COMMENT ON TABLE audit_log IS 'Immutable log of all agent actions for traceability';
COMMENT ON TABLE brief_archive IS 'Archived brief exports (PDF, JSON)';
COMMENT ON TABLE governance_metadata IS 'IFX/KQR versioning and validation state';
