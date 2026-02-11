-- ============================================================
-- Fix RLS Policies - Add explicit INSERT/UPDATE policies
-- ============================================================
-- Problem: FOR ALL USING policies may not work correctly for INSERT.
-- Solution: Create separate policies with WITH CHECK for INSERT.
-- ============================================================

-- Drop existing policies (if they exist) and recreate with proper permissions
-- Using DO blocks to handle "policy does not exist" errors gracefully

-- ============================================================
-- PROJECTS
-- ============================================================
DROP POLICY IF EXISTS projects_owner_policy ON projects;
DROP POLICY IF EXISTS projects_select_policy ON projects;
DROP POLICY IF EXISTS projects_insert_policy ON projects;
DROP POLICY IF EXISTS projects_update_policy ON projects;
DROP POLICY IF EXISTS projects_delete_policy ON projects;

CREATE POLICY projects_select_policy ON projects
  FOR SELECT USING (auth.uid() = owner_id);

CREATE POLICY projects_insert_policy ON projects
  FOR INSERT WITH CHECK (auth.uid() = owner_id);

CREATE POLICY projects_update_policy ON projects
  FOR UPDATE USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

CREATE POLICY projects_delete_policy ON projects
  FOR DELETE USING (auth.uid() = owner_id);

-- ============================================================
-- PROJECT_SOURCES
-- ============================================================
DROP POLICY IF EXISTS project_sources_policy ON project_sources;
DROP POLICY IF EXISTS project_sources_select_policy ON project_sources;
DROP POLICY IF EXISTS project_sources_insert_policy ON project_sources;
DROP POLICY IF EXISTS project_sources_update_policy ON project_sources;
DROP POLICY IF EXISTS project_sources_delete_policy ON project_sources;

CREATE POLICY project_sources_select_policy ON project_sources
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = project_sources.project_id AND projects.owner_id = auth.uid())
  );

CREATE POLICY project_sources_insert_policy ON project_sources
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = project_sources.project_id AND projects.owner_id = auth.uid())
  );

CREATE POLICY project_sources_update_policy ON project_sources
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = project_sources.project_id AND projects.owner_id = auth.uid())
  );

CREATE POLICY project_sources_delete_policy ON project_sources
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = project_sources.project_id AND projects.owner_id = auth.uid())
  );

-- ============================================================
-- PROJECT_TEAM
-- ============================================================
DROP POLICY IF EXISTS project_team_owner_policy ON project_team;
DROP POLICY IF EXISTS project_team_member_policy ON project_team;
DROP POLICY IF EXISTS project_team_select_policy ON project_team;
DROP POLICY IF EXISTS project_team_insert_policy ON project_team;
DROP POLICY IF EXISTS project_team_update_policy ON project_team;
DROP POLICY IF EXISTS project_team_delete_policy ON project_team;

CREATE POLICY project_team_select_policy ON project_team
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = project_team.project_id AND projects.owner_id = auth.uid())
    OR user_id = auth.uid()
  );

CREATE POLICY project_team_insert_policy ON project_team
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = project_team.project_id AND projects.owner_id = auth.uid())
  );

CREATE POLICY project_team_update_policy ON project_team
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = project_team.project_id AND projects.owner_id = auth.uid())
  );

CREATE POLICY project_team_delete_policy ON project_team
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = project_team.project_id AND projects.owner_id = auth.uid())
  );

-- ============================================================
-- PROJECT_STACK
-- ============================================================
DROP POLICY IF EXISTS project_stack_policy ON project_stack;
DROP POLICY IF EXISTS project_stack_select_policy ON project_stack;
DROP POLICY IF EXISTS project_stack_insert_policy ON project_stack;
DROP POLICY IF EXISTS project_stack_update_policy ON project_stack;
DROP POLICY IF EXISTS project_stack_delete_policy ON project_stack;

CREATE POLICY project_stack_select_policy ON project_stack
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = project_stack.project_id AND projects.owner_id = auth.uid())
  );

CREATE POLICY project_stack_insert_policy ON project_stack
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = project_stack.project_id AND projects.owner_id = auth.uid())
  );

CREATE POLICY project_stack_update_policy ON project_stack
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = project_stack.project_id AND projects.owner_id = auth.uid())
  );

CREATE POLICY project_stack_delete_policy ON project_stack
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = project_stack.project_id AND projects.owner_id = auth.uid())
  );

-- ============================================================
-- PROJECT_MANIFEST
-- ============================================================
DROP POLICY IF EXISTS project_manifest_policy ON project_manifest;
DROP POLICY IF EXISTS project_manifest_select_policy ON project_manifest;
DROP POLICY IF EXISTS project_manifest_insert_policy ON project_manifest;
DROP POLICY IF EXISTS project_manifest_update_policy ON project_manifest;
DROP POLICY IF EXISTS project_manifest_delete_policy ON project_manifest;

CREATE POLICY project_manifest_select_policy ON project_manifest
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = project_manifest.project_id AND projects.owner_id = auth.uid())
  );

CREATE POLICY project_manifest_insert_policy ON project_manifest
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = project_manifest.project_id AND projects.owner_id = auth.uid())
  );

CREATE POLICY project_manifest_update_policy ON project_manifest
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = project_manifest.project_id AND projects.owner_id = auth.uid())
  );

CREATE POLICY project_manifest_delete_policy ON project_manifest
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = project_manifest.project_id AND projects.owner_id = auth.uid())
  );

-- ============================================================
-- CF_FINDINGS
-- ============================================================
DROP POLICY IF EXISTS cf_findings_policy ON cf_findings;
DROP POLICY IF EXISTS cf_findings_select_policy ON cf_findings;
DROP POLICY IF EXISTS cf_findings_insert_policy ON cf_findings;
DROP POLICY IF EXISTS cf_findings_update_policy ON cf_findings;
DROP POLICY IF EXISTS cf_findings_delete_policy ON cf_findings;

CREATE POLICY cf_findings_select_policy ON cf_findings
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = cf_findings.project_id AND projects.owner_id = auth.uid())
  );

CREATE POLICY cf_findings_insert_policy ON cf_findings
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = cf_findings.project_id AND projects.owner_id = auth.uid())
  );

CREATE POLICY cf_findings_update_policy ON cf_findings
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = cf_findings.project_id AND projects.owner_id = auth.uid())
  );

CREATE POLICY cf_findings_delete_policy ON cf_findings
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = cf_findings.project_id AND projects.owner_id = auth.uid())
  );

-- ============================================================
-- STACK_HEALTH
-- ============================================================
DROP POLICY IF EXISTS stack_health_policy ON stack_health;
DROP POLICY IF EXISTS stack_health_select_policy ON stack_health;
DROP POLICY IF EXISTS stack_health_insert_policy ON stack_health;
DROP POLICY IF EXISTS stack_health_update_policy ON stack_health;
DROP POLICY IF EXISTS stack_health_delete_policy ON stack_health;

CREATE POLICY stack_health_select_policy ON stack_health
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = stack_health.project_id AND projects.owner_id = auth.uid())
  );

CREATE POLICY stack_health_insert_policy ON stack_health
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = stack_health.project_id AND projects.owner_id = auth.uid())
  );

CREATE POLICY stack_health_update_policy ON stack_health
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = stack_health.project_id AND projects.owner_id = auth.uid())
  );

CREATE POLICY stack_health_delete_policy ON stack_health
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = stack_health.project_id AND projects.owner_id = auth.uid())
  );

-- ============================================================
-- COST_TRACKING
-- ============================================================
DROP POLICY IF EXISTS cost_tracking_policy ON cost_tracking;
DROP POLICY IF EXISTS cost_tracking_select_policy ON cost_tracking;
DROP POLICY IF EXISTS cost_tracking_insert_policy ON cost_tracking;
DROP POLICY IF EXISTS cost_tracking_update_policy ON cost_tracking;
DROP POLICY IF EXISTS cost_tracking_delete_policy ON cost_tracking;

CREATE POLICY cost_tracking_select_policy ON cost_tracking
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = cost_tracking.project_id AND projects.owner_id = auth.uid())
  );

CREATE POLICY cost_tracking_insert_policy ON cost_tracking
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = cost_tracking.project_id AND projects.owner_id = auth.uid())
  );

CREATE POLICY cost_tracking_update_policy ON cost_tracking
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = cost_tracking.project_id AND projects.owner_id = auth.uid())
  );

CREATE POLICY cost_tracking_delete_policy ON cost_tracking
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = cost_tracking.project_id AND projects.owner_id = auth.uid())
  );

-- ============================================================
-- RECOMMENDATIONS
-- ============================================================
DROP POLICY IF EXISTS recommendations_policy ON recommendations;
DROP POLICY IF EXISTS recommendations_select_policy ON recommendations;
DROP POLICY IF EXISTS recommendations_insert_policy ON recommendations;
DROP POLICY IF EXISTS recommendations_update_policy ON recommendations;
DROP POLICY IF EXISTS recommendations_delete_policy ON recommendations;

CREATE POLICY recommendations_select_policy ON recommendations
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = recommendations.project_id AND projects.owner_id = auth.uid())
    OR EXISTS (SELECT 1 FROM project_team WHERE project_team.project_id = recommendations.project_id AND project_team.user_id = auth.uid())
  );

CREATE POLICY recommendations_insert_policy ON recommendations
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = recommendations.project_id AND projects.owner_id = auth.uid())
  );

CREATE POLICY recommendations_update_policy ON recommendations
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = recommendations.project_id AND projects.owner_id = auth.uid())
  );

CREATE POLICY recommendations_delete_policy ON recommendations
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = recommendations.project_id AND projects.owner_id = auth.uid())
  );

-- ============================================================
-- RECOMMENDATION_FEEDBACK
-- ============================================================
DROP POLICY IF EXISTS recommendation_feedback_policy ON recommendation_feedback;
DROP POLICY IF EXISTS recommendation_feedback_select_policy ON recommendation_feedback;
DROP POLICY IF EXISTS recommendation_feedback_insert_policy ON recommendation_feedback;
DROP POLICY IF EXISTS recommendation_feedback_update_policy ON recommendation_feedback;
DROP POLICY IF EXISTS recommendation_feedback_delete_policy ON recommendation_feedback;

CREATE POLICY recommendation_feedback_select_policy ON recommendation_feedback
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM recommendations r
      JOIN projects p ON p.id = r.project_id
      WHERE r.id = recommendation_feedback.recommendation_id
      AND (p.owner_id = auth.uid() OR EXISTS (
        SELECT 1 FROM project_team pt WHERE pt.project_id = p.id AND pt.user_id = auth.uid()
      ))
    )
  );

CREATE POLICY recommendation_feedback_insert_policy ON recommendation_feedback
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM recommendations r
      JOIN projects p ON p.id = r.project_id
      WHERE r.id = recommendation_feedback.recommendation_id
      AND (p.owner_id = auth.uid() OR EXISTS (
        SELECT 1 FROM project_team pt WHERE pt.project_id = p.id AND pt.user_id = auth.uid()
      ))
    )
  );

CREATE POLICY recommendation_feedback_update_policy ON recommendation_feedback
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM recommendations r
      JOIN projects p ON p.id = r.project_id
      WHERE r.id = recommendation_feedback.recommendation_id
      AND (p.owner_id = auth.uid() OR EXISTS (
        SELECT 1 FROM project_team pt WHERE pt.project_id = p.id AND pt.user_id = auth.uid()
      ))
    )
  );

CREATE POLICY recommendation_feedback_delete_policy ON recommendation_feedback
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM recommendations r
      JOIN projects p ON p.id = r.project_id
      WHERE r.id = recommendation_feedback.recommendation_id
      AND p.owner_id = auth.uid()
    )
  );

-- ============================================================
-- MIGRATION_JOBS
-- ============================================================
DROP POLICY IF EXISTS migration_jobs_policy ON migration_jobs;
DROP POLICY IF EXISTS migration_jobs_select_policy ON migration_jobs;
DROP POLICY IF EXISTS migration_jobs_insert_policy ON migration_jobs;
DROP POLICY IF EXISTS migration_jobs_update_policy ON migration_jobs;
DROP POLICY IF EXISTS migration_jobs_delete_policy ON migration_jobs;

CREATE POLICY migration_jobs_select_policy ON migration_jobs
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = migration_jobs.project_id AND projects.owner_id = auth.uid())
  );

CREATE POLICY migration_jobs_insert_policy ON migration_jobs
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = migration_jobs.project_id AND projects.owner_id = auth.uid())
  );

CREATE POLICY migration_jobs_update_policy ON migration_jobs
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = migration_jobs.project_id AND projects.owner_id = auth.uid())
  );

CREATE POLICY migration_jobs_delete_policy ON migration_jobs
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = migration_jobs.project_id AND projects.owner_id = auth.uid())
  );

-- ============================================================
-- BRIEF_ARCHIVE
-- ============================================================
DROP POLICY IF EXISTS brief_archive_policy ON brief_archive;
DROP POLICY IF EXISTS brief_archive_select_policy ON brief_archive;
DROP POLICY IF EXISTS brief_archive_insert_policy ON brief_archive;
DROP POLICY IF EXISTS brief_archive_update_policy ON brief_archive;
DROP POLICY IF EXISTS brief_archive_delete_policy ON brief_archive;

CREATE POLICY brief_archive_select_policy ON brief_archive
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = brief_archive.project_id AND projects.owner_id = auth.uid())
  );

CREATE POLICY brief_archive_insert_policy ON brief_archive
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = brief_archive.project_id AND projects.owner_id = auth.uid())
  );

CREATE POLICY brief_archive_update_policy ON brief_archive
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = brief_archive.project_id AND projects.owner_id = auth.uid())
  );

CREATE POLICY brief_archive_delete_policy ON brief_archive
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = brief_archive.project_id AND projects.owner_id = auth.uid())
  );

-- ============================================================
-- GOVERNANCE_METADATA
-- ============================================================
DROP POLICY IF EXISTS governance_metadata_policy ON governance_metadata;
DROP POLICY IF EXISTS governance_metadata_select_policy ON governance_metadata;
DROP POLICY IF EXISTS governance_metadata_insert_policy ON governance_metadata;
DROP POLICY IF EXISTS governance_metadata_update_policy ON governance_metadata;
DROP POLICY IF EXISTS governance_metadata_delete_policy ON governance_metadata;

CREATE POLICY governance_metadata_select_policy ON governance_metadata
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = governance_metadata.project_id AND projects.owner_id = auth.uid())
  );

CREATE POLICY governance_metadata_insert_policy ON governance_metadata
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = governance_metadata.project_id AND projects.owner_id = auth.uid())
  );

CREATE POLICY governance_metadata_update_policy ON governance_metadata
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = governance_metadata.project_id AND projects.owner_id = auth.uid())
  );

CREATE POLICY governance_metadata_delete_policy ON governance_metadata
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = governance_metadata.project_id AND projects.owner_id = auth.uid())
  );

-- ============================================================
-- FEED_ITEMS (special case: public read, service_role write)
-- ============================================================
DROP POLICY IF EXISTS feed_items_read_policy ON feed_items;
DROP POLICY IF EXISTS feed_items_write_policy ON feed_items;
DROP POLICY IF EXISTS feed_items_update_policy ON feed_items;
DROP POLICY IF EXISTS feed_items_select_policy ON feed_items;
DROP POLICY IF EXISTS feed_items_insert_policy ON feed_items;

CREATE POLICY feed_items_select_policy ON feed_items
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY feed_items_insert_policy ON feed_items
  FOR INSERT WITH CHECK (auth.role() = 'service_role');

CREATE POLICY feed_items_update_policy ON feed_items
  FOR UPDATE USING (auth.role() = 'service_role');

-- ============================================================
-- AUDIT_LOG (special case: read for owner, insert for service_role)
-- ============================================================
DROP POLICY IF EXISTS audit_log_read_policy ON audit_log;
DROP POLICY IF EXISTS audit_log_insert_policy ON audit_log;
DROP POLICY IF EXISTS audit_log_select_policy ON audit_log;

CREATE POLICY audit_log_select_policy ON audit_log
  FOR SELECT USING (
    project_id IS NULL
    OR EXISTS (SELECT 1 FROM projects WHERE projects.id = audit_log.project_id AND projects.owner_id = auth.uid())
  );

CREATE POLICY audit_log_insert_policy ON audit_log
  FOR INSERT WITH CHECK (auth.role() = 'service_role');
