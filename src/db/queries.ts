/**
 * TechScout — Database Query Helpers
 *
 * CRUD operations for all database tables.
 * All queries use the Supabase client and respect RLS policies.
 */

import { supabase, getAdminClient, handleSupabaseError } from './client';
import type {
  ProjectEntity,
  ProjectSourceEntity,
  ProjectTeamEntity,
  ProjectStackEntity,
  ProjectManifestEntity,
  CFFindingEntity,
  StackHealthEntity,
  FeedItemEntity,
  RecommendationEntity,
  RecommendationFeedbackEntity,
  MigrationJobEntity,
  AuditLogEntity,
} from '../types';

// ============================================================
// PROJECTS
// ============================================================

export interface CreateProjectInput {
  ownerId: string;
  name: string;
  slug: string;
  scoutingEnabled?: boolean;
  scoutingFrequency?: string;
  maxRecommendations?: number;
  focusAreas?: string[];
  excludeCategories?: string[];
}

export async function createProject(input: CreateProjectInput): Promise<ProjectEntity> {
  const { data, error } = await supabase
    .from('projects')
    .insert({
      owner_id: input.ownerId,
      name: input.name,
      slug: input.slug,
      scouting_enabled: input.scoutingEnabled ?? true,
      scouting_frequency: input.scoutingFrequency ?? 'weekly',
      max_recommendations: input.maxRecommendations ?? 5,
      focus_areas: input.focusAreas ?? [],
      exclude_categories: input.excludeCategories ?? [],
    })
    .select()
    .single();

  if (error) throw handleSupabaseError(error);
  return data as ProjectEntity;
}

export async function getProjectById(id: string): Promise<ProjectEntity | null> {
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // Not found
    throw handleSupabaseError(error);
  }
  return data as ProjectEntity;
}

export async function getProjectBySlug(ownerId: string, slug: string): Promise<ProjectEntity | null> {
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('owner_id', ownerId)
    .eq('slug', slug)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw handleSupabaseError(error);
  }
  return data as ProjectEntity;
}

export async function getProjectsByOwner(ownerId: string): Promise<ProjectEntity[]> {
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('owner_id', ownerId)
    .order('updated_at', { ascending: false });

  if (error) throw handleSupabaseError(error);
  return data as ProjectEntity[];
}

export async function updateProject(id: string, updates: Partial<CreateProjectInput>): Promise<ProjectEntity> {
  const updateData: Record<string, unknown> = {};
  if (updates.name !== undefined) updateData.name = updates.name;
  if (updates.slug !== undefined) updateData.slug = updates.slug;
  if (updates.scoutingEnabled !== undefined) updateData.scouting_enabled = updates.scoutingEnabled;
  if (updates.scoutingFrequency !== undefined) updateData.scouting_frequency = updates.scoutingFrequency;
  if (updates.maxRecommendations !== undefined) updateData.max_recommendations = updates.maxRecommendations;
  if (updates.focusAreas !== undefined) updateData.focus_areas = updates.focusAreas;
  if (updates.excludeCategories !== undefined) updateData.exclude_categories = updates.excludeCategories;

  const { data, error } = await supabase
    .from('projects')
    .update(updateData)
    .eq('id', id)
    .select()
    .single();

  if (error) throw handleSupabaseError(error);
  return data as ProjectEntity;
}

export async function deleteProject(id: string): Promise<void> {
  const { error } = await supabase
    .from('projects')
    .delete()
    .eq('id', id);

  if (error) throw handleSupabaseError(error);
}

// ============================================================
// PROJECT SOURCES
// ============================================================

export interface CreateProjectSourceInput {
  projectId: string;
  provider: string;
  connectionType: string;
  connectionConfig: Record<string, unknown>;
}

export async function createProjectSource(input: CreateProjectSourceInput): Promise<ProjectSourceEntity> {
  const { data, error } = await supabase
    .from('project_sources')
    .insert({
      project_id: input.projectId,
      provider: input.provider,
      connection_type: input.connectionType,
      connection_config: input.connectionConfig,
    })
    .select()
    .single();

  if (error) throw handleSupabaseError(error);
  return data as ProjectSourceEntity;
}

export async function getProjectSources(projectId: string): Promise<ProjectSourceEntity[]> {
  const { data, error } = await supabase
    .from('project_sources')
    .select('*')
    .eq('project_id', projectId);

  if (error) throw handleSupabaseError(error);
  return data as ProjectSourceEntity[];
}

export async function updateProjectSourceLastScan(id: string, lastScan: string): Promise<void> {
  const { error } = await supabase
    .from('project_sources')
    .update({ last_scan: lastScan })
    .eq('id', id);

  if (error) throw handleSupabaseError(error);
}

// ============================================================
// PROJECT TEAM
// ============================================================

export interface CreateTeamMemberInput {
  projectId: string;
  userId: string;
  name: string;
  role: string;
  receivesTechnicalBrief?: boolean;
  receivesHumanBrief?: boolean;
  notificationChannel?: string;
}

export async function createTeamMember(input: CreateTeamMemberInput): Promise<ProjectTeamEntity> {
  const { data, error } = await supabase
    .from('project_team')
    .insert({
      project_id: input.projectId,
      user_id: input.userId,
      name: input.name,
      role: input.role,
      receives_technical_brief: input.receivesTechnicalBrief ?? true,
      receives_human_brief: input.receivesHumanBrief ?? true,
      notification_channel: input.notificationChannel ?? 'email',
    })
    .select()
    .single();

  if (error) throw handleSupabaseError(error);
  return data as ProjectTeamEntity;
}

export async function getProjectTeam(projectId: string): Promise<ProjectTeamEntity[]> {
  const { data, error } = await supabase
    .from('project_team')
    .select('*')
    .eq('project_id', projectId);

  if (error) throw handleSupabaseError(error);
  return data as ProjectTeamEntity[];
}

// ============================================================
// PROJECT STACK
// ============================================================

export interface UpsertProjectStackInput {
  projectId: string;
  languages: Record<string, unknown>[];
  frameworks: Record<string, unknown>[];
  databases: Record<string, unknown>[];
  infrastructure: Record<string, unknown>;
  keyDependencies: Record<string, unknown>[];
  allDependencies: Record<string, unknown>;
}

export async function upsertProjectStack(input: UpsertProjectStackInput): Promise<ProjectStackEntity> {
  const { data, error } = await supabase
    .from('project_stack')
    .upsert({
      project_id: input.projectId,
      languages: input.languages,
      frameworks: input.frameworks,
      databases: input.databases,
      infrastructure: input.infrastructure,
      key_dependencies: input.keyDependencies,
      all_dependencies: input.allDependencies,
    }, { onConflict: 'project_id' })
    .select()
    .single();

  if (error) throw handleSupabaseError(error);
  return data as ProjectStackEntity;
}

export async function getProjectStack(projectId: string): Promise<ProjectStackEntity | null> {
  const { data, error } = await supabase
    .from('project_stack')
    .select('*')
    .eq('project_id', projectId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw handleSupabaseError(error);
  }
  return data as ProjectStackEntity;
}

// ============================================================
// PROJECT MANIFEST
// ============================================================

export interface UpsertProjectManifestInput {
  projectId: string;
  phase: string;
  description?: string;
  objectives?: string[];
  painPoints?: string[];
  constraints?: string[];
  openTo?: string[];
  notOpenTo?: string[];
}

export async function upsertProjectManifest(input: UpsertProjectManifestInput): Promise<ProjectManifestEntity> {
  const { data, error } = await supabase
    .from('project_manifest')
    .upsert({
      project_id: input.projectId,
      phase: input.phase,
      description: input.description ?? null,
      objectives: input.objectives ?? [],
      pain_points: input.painPoints ?? [],
      constraints: input.constraints ?? [],
      open_to: input.openTo ?? [],
      not_open_to: input.notOpenTo ?? [],
    }, { onConflict: 'project_id' })
    .select()
    .single();

  if (error) throw handleSupabaseError(error);
  return data as ProjectManifestEntity;
}

export async function getProjectManifest(projectId: string): Promise<ProjectManifestEntity | null> {
  const { data, error } = await supabase
    .from('project_manifest')
    .select('*')
    .eq('project_id', projectId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw handleSupabaseError(error);
  }
  return data as ProjectManifestEntity;
}

// ============================================================
// CF FINDINGS
// ============================================================

export interface CreateCFindingInput {
  projectId: string;
  findingId: string;
  layer: string;
  category: string;
  severity: string;
  patternId?: string;
  description: string;
  filesAffected: number;
  ifxTag: string;
  scanVersion?: string;
  scannedAt: string;
}

export async function createCFFinding(input: CreateCFindingInput): Promise<CFFindingEntity> {
  const { data, error } = await supabase
    .from('cf_findings')
    .insert({
      project_id: input.projectId,
      finding_id: input.findingId,
      layer: input.layer,
      category: input.category,
      severity: input.severity,
      pattern_id: input.patternId ?? null,
      description: input.description,
      files_affected: input.filesAffected,
      ifx_tag: input.ifxTag,
      scan_version: input.scanVersion ?? null,
      scanned_at: input.scannedAt,
    })
    .select()
    .single();

  if (error) throw handleSupabaseError(error);
  return data as CFFindingEntity;
}

export async function getUnresolvedCFFindings(projectId: string): Promise<CFFindingEntity[]> {
  const { data, error } = await supabase
    .from('cf_findings')
    .select('*')
    .eq('project_id', projectId)
    .eq('is_resolved', false)
    .order('severity', { ascending: true }); // critical first

  if (error) throw handleSupabaseError(error);
  return data as CFFindingEntity[];
}

export async function resolveCFFinding(id: string, recommendationId: string): Promise<void> {
  const { error } = await supabase
    .from('cf_findings')
    .update({
      is_resolved: true,
      resolved_by_recommendation: recommendationId,
      resolved_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) throw handleSupabaseError(error);
}

// ============================================================
// STACK HEALTH
// ============================================================

export interface UpsertStackHealthInput {
  projectId: string;
  overallScore: number;
  components: Record<string, unknown>;
}

export async function upsertStackHealth(input: UpsertStackHealthInput): Promise<StackHealthEntity> {
  const { data, error } = await supabase
    .from('stack_health')
    .upsert({
      project_id: input.projectId,
      overall_score: input.overallScore,
      components: input.components,
      last_calculated: new Date().toISOString(),
    }, { onConflict: 'project_id' })
    .select()
    .single();

  if (error) throw handleSupabaseError(error);
  return data as StackHealthEntity;
}

export async function getStackHealth(projectId: string): Promise<StackHealthEntity | null> {
  const { data, error } = await supabase
    .from('stack_health')
    .select('*')
    .eq('project_id', projectId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw handleSupabaseError(error);
  }
  return data as StackHealthEntity;
}

// ============================================================
// FEED ITEMS (uses admin client for writes)
// ============================================================

export interface CreateFeedItemInput {
  sourceName: string;
  sourceTier: string;
  sourceReliability: string;
  externalId?: string;
  title: string;
  url?: string;
  description?: string;
  contentSummary?: string;
  publishedAt?: string;
  categories?: string[];
  technologies?: string[];
  languageEcosystems?: string[];
  traction?: Record<string, unknown>;
  contentHash?: string;
}

export async function createFeedItem(input: CreateFeedItemInput): Promise<FeedItemEntity> {
  const admin = getAdminClient();
  const { data, error } = await admin
    .from('feed_items')
    .insert({
      source_name: input.sourceName,
      source_tier: input.sourceTier,
      source_reliability: input.sourceReliability,
      external_id: input.externalId ?? null,
      title: input.title,
      url: input.url ?? null,
      description: input.description ?? null,
      content_summary: input.contentSummary ?? null,
      published_at: input.publishedAt ?? null,
      fetched_at: new Date().toISOString(),
      categories: input.categories ?? [],
      technologies: input.technologies ?? [],
      language_ecosystems: input.languageEcosystems ?? [],
      traction: input.traction ?? {},
      content_hash: input.contentHash ?? null,
    })
    .select()
    .single();

  if (error) throw handleSupabaseError(error);
  return data as FeedItemEntity;
}

export async function getUnprocessedFeedItems(limit: number = 100): Promise<FeedItemEntity[]> {
  const { data, error } = await supabase
    .from('feed_items')
    .select('*')
    .eq('is_processed', false)
    .order('published_at', { ascending: false })
    .limit(limit);

  if (error) throw handleSupabaseError(error);
  return data as FeedItemEntity[];
}

export async function markFeedItemProcessed(id: string): Promise<void> {
  const admin = getAdminClient();
  const { error } = await admin
    .from('feed_items')
    .update({
      is_processed: true,
      processed_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) throw handleSupabaseError(error);
}

export async function getFeedItemByContentHash(contentHash: string): Promise<FeedItemEntity | null> {
  const { data, error } = await supabase
    .from('feed_items')
    .select('*')
    .eq('content_hash', contentHash)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw handleSupabaseError(error);
  }
  return data as FeedItemEntity;
}

// ============================================================
// RECOMMENDATIONS
// ============================================================

export interface CreateRecommendationInput {
  projectId: string;
  feedItemId?: string;
  ifxTraceId: string;
  modelUsed: string;
  type: string;
  action: string;
  priority: string;
  confidence: number;
  subject: Record<string, unknown>;
  replaces?: string;
  complements?: string;
  enables?: string;
  roleVisibility: string[];
  stabilityAssessment: Record<string, unknown>;
  technical: Record<string, unknown>;
  humanFriendly: Record<string, unknown>;
  kqr: Record<string, unknown>;
}

export async function createRecommendation(input: CreateRecommendationInput): Promise<RecommendationEntity> {
  const { data, error } = await supabase
    .from('recommendations')
    .insert({
      project_id: input.projectId,
      feed_item_id: input.feedItemId ?? null,
      ifx_trace_id: input.ifxTraceId,
      model_used: input.modelUsed,
      generated_at: new Date().toISOString(),
      type: input.type,
      action: input.action,
      priority: input.priority,
      confidence: input.confidence,
      subject: input.subject,
      replaces: input.replaces ?? null,
      complements: input.complements ?? null,
      enables: input.enables ?? null,
      role_visibility: input.roleVisibility,
      stability_assessment: input.stabilityAssessment,
      technical: input.technical,
      human_friendly: input.humanFriendly,
      kqr: input.kqr,
    })
    .select()
    .single();

  if (error) throw handleSupabaseError(error);
  return data as RecommendationEntity;
}

export async function getProjectRecommendations(
  projectId: string,
  options: { limit?: number; undeliveredOnly?: boolean } = {}
): Promise<RecommendationEntity[]> {
  let query = supabase
    .from('recommendations')
    .select('*')
    .eq('project_id', projectId)
    .order('generated_at', { ascending: false });

  if (options.undeliveredOnly) {
    query = query.eq('is_delivered', false);
  }

  if (options.limit) {
    query = query.limit(options.limit);
  }

  const { data, error } = await query;

  if (error) throw handleSupabaseError(error);
  return data as RecommendationEntity[];
}

export async function markRecommendationDelivered(
  id: string,
  channel: string
): Promise<void> {
  const { error } = await supabase
    .from('recommendations')
    .update({
      is_delivered: true,
      delivered_at: new Date().toISOString(),
      delivery_channel: channel,
    })
    .eq('id', id);

  if (error) throw handleSupabaseError(error);
}

// ============================================================
// RECOMMENDATION FEEDBACK
// ============================================================

export interface CreateFeedbackInput {
  recommendationId: string;
}

export async function createFeedback(input: CreateFeedbackInput): Promise<RecommendationFeedbackEntity> {
  const { data, error } = await supabase
    .from('recommendation_feedback')
    .insert({
      recommendation_id: input.recommendationId,
      status: 'pending',
    })
    .select()
    .single();

  if (error) throw handleSupabaseError(error);
  return data as RecommendationFeedbackEntity;
}

export async function updateFeedbackStatus(
  recommendationId: string,
  status: string,
  userNotes?: string,
  submittedBy?: string
): Promise<void> {
  const { error } = await supabase
    .from('recommendation_feedback')
    .update({
      status,
      user_notes: userNotes ?? null,
      submitted_by: submittedBy ?? null,
      submitted_at: new Date().toISOString(),
    })
    .eq('recommendation_id', recommendationId);

  if (error) throw handleSupabaseError(error);
}

export async function recordAdoption(
  recommendationId: string,
  actualDays: number,
  notes?: string
): Promise<void> {
  const { error } = await supabase
    .from('recommendation_feedback')
    .update({
      status: 'adopted',
      actual_days: actualDays,
      adoption_notes: notes ?? null,
      adopted_at: new Date().toISOString(),
    })
    .eq('recommendation_id', recommendationId);

  if (error) throw handleSupabaseError(error);
}

// ============================================================
// MIGRATION JOBS
// ============================================================

export interface CreateMigrationJobInput {
  recommendationId: string;
  projectId: string;
  ifxTraceId: string;
  triggeredBy: string;
}

export async function createMigrationJob(input: CreateMigrationJobInput): Promise<MigrationJobEntity> {
  const { data, error } = await supabase
    .from('migration_jobs')
    .insert({
      recommendation_id: input.recommendationId,
      project_id: input.projectId,
      ifx_trace_id: input.ifxTraceId,
      triggered_by: input.triggeredBy,
      triggered_at: new Date().toISOString(),
      status: 'pending',
      human_review_status: 'pending',
      safety_stopped: false,
    })
    .select()
    .single();

  if (error) throw handleSupabaseError(error);
  return data as MigrationJobEntity;
}

export async function updateMigrationJobStatus(
  id: string,
  status: string
): Promise<void> {
  const { error } = await supabase
    .from('migration_jobs')
    .update({ status })
    .eq('id', id);

  if (error) throw handleSupabaseError(error);
}

export async function getMigrationJob(id: string): Promise<MigrationJobEntity | null> {
  const { data, error } = await supabase
    .from('migration_jobs')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw handleSupabaseError(error);
  }
  return data as MigrationJobEntity;
}

// ============================================================
// AUDIT LOG (uses admin client, append-only)
// ============================================================

export interface CreateAuditLogInput {
  migrationJobId?: string;
  projectId?: string;
  action: string;
  detail?: string;
  actor?: string;
  actorType?: string;
  metadata?: Record<string, unknown>;
}

export async function createAuditLog(input: CreateAuditLogInput): Promise<AuditLogEntity> {
  const admin = getAdminClient();
  const { data, error } = await admin
    .from('audit_log')
    .insert({
      migration_job_id: input.migrationJobId ?? null,
      project_id: input.projectId ?? null,
      action: input.action,
      detail: input.detail ?? null,
      actor: input.actor ?? null,
      actor_type: input.actorType ?? 'agent',
      metadata: input.metadata ?? {},
    })
    .select()
    .single();

  if (error) throw handleSupabaseError(error);
  return data as AuditLogEntity;
}

export async function getAuditLogForJob(migrationJobId: string): Promise<AuditLogEntity[]> {
  const { data, error } = await supabase
    .from('audit_log')
    .select('*')
    .eq('migration_job_id', migrationJobId)
    .order('timestamp', { ascending: true });

  if (error) throw handleSupabaseError(error);
  return data as AuditLogEntity[];
}

// ============================================================
// GOVERNANCE METADATA
// ============================================================

export interface UpsertGovernanceInput {
  projectId: string;
  ifxVersion?: string;
  kqrVersion?: string;
  profileCompletenessScore?: number;
  dataSourcesUsed?: Record<string, unknown>[];
}

export async function upsertGovernanceMetadata(input: UpsertGovernanceInput): Promise<void> {
  const { error } = await supabase
    .from('governance_metadata')
    .upsert({
      project_id: input.projectId,
      ifx_version: input.ifxVersion ?? '1.0',
      kqr_version: input.kqrVersion ?? '1.0',
      last_profile_validation: new Date().toISOString(),
      profile_completeness_score: input.profileCompletenessScore ?? 0,
      data_sources_used: input.dataSourcesUsed ?? [],
    }, { onConflict: 'project_id' });

  if (error) throw handleSupabaseError(error);
}

// ============================================================
// COST TRACKING
// ============================================================

export interface CreateCostTrackingInput {
  projectId: string;
  recommendationId: string;
  subject: string;
  estimatedDays: number;
  actualDays?: number;
  notes?: string;
  adoptedAt: string;
}

export async function createCostTracking(input: CreateCostTrackingInput): Promise<void> {
  const { error } = await supabase
    .from('cost_tracking')
    .insert({
      project_id: input.projectId,
      recommendation_id: input.recommendationId,
      subject: input.subject,
      estimated_days: input.estimatedDays,
      actual_days: input.actualDays ?? null,
      notes: input.notes ?? null,
      adopted_at: input.adoptedAt,
    });

  if (error) throw handleSupabaseError(error);
}

export async function getCostTrackingHistory(projectId: string): Promise<Array<{
  recommendationId: string;
  subject: string;
  estimatedDays: number;
  actualDays: number | null;
  adoptedAt: string;
}>> {
  const { data, error } = await supabase
    .from('cost_tracking')
    .select('recommendation_id, subject, estimated_days, actual_days, adopted_at')
    .eq('project_id', projectId)
    .order('adopted_at', { ascending: false });

  if (error) throw handleSupabaseError(error);
  return (data ?? []).map(row => ({
    recommendationId: row.recommendation_id,
    subject: row.subject,
    estimatedDays: row.estimated_days,
    actualDays: row.actual_days,
    adoptedAt: row.adopted_at,
  }));
}
