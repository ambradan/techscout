/**
 * TechScout — Project Profile Types v1.1
 *
 * Central contract of the system.
 * Any provider (GitHub, GitLab, local upload, CLI, etc.)
 * must produce an object conforming to this schema.
 * The Matching Engine consumes ONLY this format.
 */

import { z } from 'zod';
import { IFXGovernanceSchema } from './ifx';
import type { IFXGovernance } from './ifx';

// ============================================================
// ENUMS AND CONSTANTS
// ============================================================

export const ProjectPhaseSchema = z.enum(['mvp', 'growth', 'scale', 'maintenance', 'legacy']);
export type ProjectPhase = z.infer<typeof ProjectPhaseSchema>;

export const TeamRoleSchema = z.enum([
  'developer_frontend',
  'developer_backend',
  'developer_fullstack',
  'pm',
  'stakeholder',
  'other',
]);
export type TeamRole = z.infer<typeof TeamRoleSchema>;

export const ScoutingFrequencySchema = z.enum(['daily', 'weekly', 'biweekly', 'monthly']);
export type ScoutingFrequency = z.infer<typeof ScoutingFrequencySchema>;

export const SourceProviderSchema = z.enum([
  'github',
  'gitlab',
  'bitbucket',
  'railway',
  'vercel',
  'local_upload',
  'cli_local',
  'manual_manifest',
]);
export type SourceProvider = z.infer<typeof SourceProviderSchema>;

export const ConnectionTypeSchema = z.enum(['oauth', 'token', 'none']);
export type ConnectionType = z.infer<typeof ConnectionTypeSchema>;

export const LanguageRoleSchema = z.enum(['primary', 'secondary', 'config', 'scripting']);
export type LanguageRole = z.infer<typeof LanguageRoleSchema>;

export const FrameworkCategorySchema = z.enum([
  'frontend',
  'backend',
  'fullstack',
  'styling',
  'testing',
  'build',
  'other',
]);
export type FrameworkCategory = z.infer<typeof FrameworkCategorySchema>;

export const DependencyEcosystemSchema = z.enum([
  'npm',
  'pip',
  'cargo',
  'go',
  'maven',
  'nuget',
  'gems',
  'other',
]);
export type DependencyEcosystem = z.infer<typeof DependencyEcosystemSchema>;

export const CFSeveritySchema = z.enum(['critical', 'high', 'medium', 'low']);
export type CFSeverity = z.infer<typeof CFSeveritySchema>;

export const BreakingChangeAlertTypeSchema = z.enum([
  'major_version',
  'deprecation_notice',
  'security_advisory',
  'eol_announcement',
]);
export type BreakingChangeAlertType = z.infer<typeof BreakingChangeAlertTypeSchema>;

export const HealthTrendSchema = z.enum(['improving', 'stable', 'declining']);
export type HealthTrend = z.infer<typeof HealthTrendSchema>;

// ============================================================
// TEAM
// ============================================================

export const TeamMemberSchema = z.object({
  userId: z.string(),
  name: z.string(),
  role: TeamRoleSchema,
  receivesTechnicalBrief: z.boolean(),
  receivesHumanBrief: z.boolean(),
  notificationChannel: z.enum(['email', 'slack']),
});
export type TeamMember = z.infer<typeof TeamMemberSchema>;

// ============================================================
// NOTIFICATION CHANNELS
// ============================================================

export const NotificationChannelSchema = z.object({
  type: z.enum(['email', 'slack']),
  target: z.string(),
});
export type NotificationChannel = z.infer<typeof NotificationChannelSchema>;

// ============================================================
// SCOUTING CONFIGURATION
// ============================================================

export const BreakingChangesConfigSchema = z.object({
  enabled: z.boolean(),
  alertOn: z.array(BreakingChangeAlertTypeSchema),
  delivery: z.enum(['immediate', 'next_brief']),
  channels: z.array(NotificationChannelSchema),
});
export type BreakingChangesConfig = z.infer<typeof BreakingChangesConfigSchema>;

export const ExportConfigSchema = z.object({
  enabled: z.boolean(),
  format: z.array(z.enum(['pdf', 'json', 'markdown'])),
  frequency: z.enum(['after_each_brief', 'weekly', 'monthly']),
  storage: z.enum(['supabase_storage', 's3']),
  retentionDays: z.number().int().min(1),
});
export type ExportConfig = z.infer<typeof ExportConfigSchema>;

export const AgentSafetyConfigSchema = z.object({
  maxFilesModified: z.number().int().min(1),
  maxLinesChanged: z.number().int().min(1),
  maxExecutionTimeMinutes: z.number().int().min(1),
  complexityThreshold: z.number().min(1),
  requireTestsPass: z.boolean(),
  requireBuildPass: z.boolean().optional(),
  forbiddenPaths: z.array(z.string()).optional(),
  forbiddenOperations: z.array(z.string()).optional(),
});
export type AgentSafetyConfig = z.infer<typeof AgentSafetyConfigSchema>;

export const AgentConfigSchema = z.object({
  enabled: z.boolean(),
  autoApprove: z.boolean().optional(),
  requireReview: z.boolean().optional(),
  gitProvider: z.enum(['github', 'gitlab', 'bitbucket']),
  baseBranch: z.string(),
  branchPrefix: z.string(),
  safety: AgentSafetyConfigSchema,
});
export type AgentConfig = z.infer<typeof AgentConfigSchema>;

export const ScoutingConfigSchema = z.object({
  enabled: z.boolean(),
  frequency: ScoutingFrequencySchema,
  maxRecommendations: z.number().int().min(1).max(20),
  focusAreas: z.array(z.string()),
  excludeCategories: z.array(z.string()),
  notificationChannels: z.array(NotificationChannelSchema),
  breakingChanges: BreakingChangesConfigSchema,
  export: ExportConfigSchema,
  agent: AgentConfigSchema,
});
export type ScoutingConfig = z.infer<typeof ScoutingConfigSchema>;

// ============================================================
// SOURCES (Multi-provider)
// ============================================================

export const GitHubRepoSchema = z.object({
  owner: z.string(),
  name: z.string(),
  branch: z.string(),
});
export type GitHubRepo = z.infer<typeof GitHubRepoSchema>;

export const GitLabRepoSchema = z.object({
  projectId: z.number(),
  branch: z.string(),
});
export type GitLabRepo = z.infer<typeof GitLabRepoSchema>;

export const SourceConnectionSchema = z.object({
  type: ConnectionTypeSchema,
  instance: z.string().optional(), // For GitLab self-hosted
  repos: z.union([z.array(GitHubRepoSchema), z.array(GitLabRepoSchema)]).optional(),
  projectId: z.string().optional(), // For Railway, Vercel
  uploadId: z.string().optional(), // For local_upload
  lastPush: z.string().datetime().optional(), // For cli_local
  filesUploaded: z.array(z.string()).optional(), // For manual_manifest
});
export type SourceConnection = z.infer<typeof SourceConnectionSchema>;

export const ProjectSourceSchema = z.object({
  provider: SourceProviderSchema,
  connection: SourceConnectionSchema,
  lastScan: z.string().datetime().nullable(),
});
export type ProjectSource = z.infer<typeof ProjectSourceSchema>;

// ============================================================
// STACK
// ============================================================

export const LanguageInfoSchema = z.object({
  name: z.string(),
  percentage: z.number().min(0).max(100),
  role: LanguageRoleSchema,
});
export type LanguageInfo = z.infer<typeof LanguageInfoSchema>;

export const FrameworkInfoSchema = z.object({
  name: z.string(),
  version: z.string(),
  category: FrameworkCategorySchema,
});
export type FrameworkInfo = z.infer<typeof FrameworkInfoSchema>;

export const DatabaseInfoSchema = z.object({
  name: z.string(),
  version: z.string(),
  provider: z.string().optional(),
});
export type DatabaseInfo = z.infer<typeof DatabaseInfoSchema>;

export const HostingInfoSchema = z.object({
  name: z.string(),
  services: z.array(z.string()),
});
export type HostingInfo = z.infer<typeof HostingInfoSchema>;

export const InfrastructureInfoSchema = z.object({
  hosting: z.array(HostingInfoSchema),
  ciCd: z.array(z.object({ name: z.string() })),
  containerization: z.array(z.object({ name: z.string(), version: z.string() })).optional(),
});
export type InfrastructureInfo = z.infer<typeof InfrastructureInfoSchema>;

export const KeyDependencySchema = z.object({
  name: z.string(),
  version: z.string(),
  ecosystem: DependencyEcosystemSchema,
  category: z.string().optional(),
  isDevDep: z.boolean().optional(),
});
export type KeyDependency = z.infer<typeof KeyDependencySchema>;

export const EcosystemDependenciesSchema = z.object({
  direct: z.union([z.number().int().min(0), z.array(z.string())]),
  dev: z.union([z.number().int().min(0), z.array(z.string())]),
  packages: z.array(z.string()).optional(),
});
export type EcosystemDependencies = z.infer<typeof EcosystemDependenciesSchema>;

export const AllDependenciesSchema = z.record(z.string(), EcosystemDependenciesSchema.optional());
export type AllDependencies = z.infer<typeof AllDependenciesSchema>;

export const ProjectStackSchema = z.object({
  languages: z.array(LanguageInfoSchema),
  frameworks: z.array(FrameworkInfoSchema),
  databases: z.array(DatabaseInfoSchema),
  infrastructure: InfrastructureInfoSchema.optional(),
  keyDependencies: z.array(KeyDependencySchema),
  allDependencies: AllDependenciesSchema,
  lastUpdated: z.string().datetime().optional(),
});
export type ProjectStack = z.infer<typeof ProjectStackSchema>;

// ============================================================
// STACK HEALTH (for Stability Gate)
// ============================================================

export const HealthComponentScoreSchema = z.object({
  score: z.number().min(0).max(1),
  factors: z.array(z.string()).optional(),
  trend: HealthTrendSchema.optional(),
});
export type HealthComponentScore = z.infer<typeof HealthComponentScoreSchema>;

export const StackHealthComponentsSchema = z.object({
  security: HealthComponentScoreSchema.optional(),
  freshness: HealthComponentScoreSchema.optional(),
  maintenanceRisk: HealthComponentScoreSchema.optional(),
  complexity: HealthComponentScoreSchema.optional(),
  maintainability: HealthComponentScoreSchema.optional(),
  performance: HealthComponentScoreSchema.optional(),
  scalability: HealthComponentScoreSchema.optional(),
});
export type StackHealthComponents = z.infer<typeof StackHealthComponentsSchema>;

export const StackHealthSchema = z.object({
  overallScore: z.number().min(0).max(1),
  lastCalculated: z.string().datetime(),
  components: StackHealthComponentsSchema,
});
export type StackHealth = z.infer<typeof StackHealthSchema>;

// ============================================================
// MANIFEST (User-provided context)
// ============================================================

export const ProjectManifestSchema = z.object({
  phase: ProjectPhaseSchema.optional(),
  description: z.string().optional(),
  objectives: z.array(z.string()).optional(),
  painPoints: z.array(z.string()).optional(),
  constraints: z.array(z.string()).optional(),
  openTo: z.array(z.string()).optional(),
  notOpenTo: z.array(z.string()).optional(),
  goals: z.array(z.string()).optional(),
});
export type ProjectManifest = z.infer<typeof ProjectManifestSchema>;

// ============================================================
// CODE FORENSICS FINDINGS
// ============================================================

export const CFFindingSchema = z.object({
  id: z.string(),
  layer: z.string(),
  category: z.string(),
  severity: CFSeveritySchema,
  patternId: z.string(),
  description: z.string(),
  filesAffected: z.number().int().min(0),
  ifxTag: z.enum(['FACT', 'INFERENCE']),
});
export type CFFinding = z.infer<typeof CFFindingSchema>;

export const CFScanSummarySchema = z.object({
  totalFindings: z.number().int().min(0),
  critical: z.number().int().min(0),
  high: z.number().int().min(0),
  medium: z.number().int().min(0),
  low: z.number().int().min(0),
});
export type CFScanSummary = z.infer<typeof CFScanSummarySchema>;

export const CFFindingsSchema = z.object({
  lastScan: z.string().datetime(),
  scanVersion: z.string(),
  summary: CFScanSummarySchema,
  findings: z.array(CFFindingSchema),
});
export type CFFindings = z.infer<typeof CFFindingsSchema>;

// ============================================================
// COST TRACKING (for effort calibration)
// ============================================================

export const AdoptionRecordSchema = z.object({
  recommendationId: z.string(),
  subject: z.string(),
  estimatedDays: z.number().min(0),
  actualDays: z.number().min(0),
  notes: z.string().optional(),
  adoptedAt: z.string().datetime(),
});
export type AdoptionRecord = z.infer<typeof AdoptionRecordSchema>;

export const CostCalibrationSchema = z.object({
  totalAdoptions: z.number().int().min(0),
  avgEstimateAccuracy: z.number().min(0),
  biasDirection: z.enum(['underestimate', 'overestimate', 'balanced']),
});
export type CostCalibration = z.infer<typeof CostCalibrationSchema>;

export const CostTrackingSchema = z.object({
  adoptions: z.array(AdoptionRecordSchema),
  calibration: CostCalibrationSchema,
});
export type CostTracking = z.infer<typeof CostTrackingSchema>;

// ============================================================
// COMPLETE PROJECT PROFILE
// ============================================================

export const ProjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string().optional(),
  owner: z.string().optional(),
  ownerId: z.string().optional(),
  phase: ProjectPhaseSchema.optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Project = z.infer<typeof ProjectSchema>;

export const ProjectProfileSchema = z.object({
  project: ProjectSchema,
  team: z.array(TeamMemberSchema),
  scouting: ScoutingConfigSchema,
  sources: z.array(ProjectSourceSchema),
  stack: ProjectStackSchema,
  stackHealth: StackHealthSchema,
  manifest: ProjectManifestSchema,
  cfFindings: CFFindingsSchema.nullable(),
  costTracking: CostTrackingSchema.nullable(),
  governance: IFXGovernanceSchema.optional(),
});
export type ProjectProfile = z.infer<typeof ProjectProfileSchema>;

// ============================================================
// PARTIAL PROFILE (for provider output)
// ============================================================

export const PartialProjectProfileSchema = z.object({
  source: SourceProviderSchema,
  fetchedAt: z.string().datetime(),
  stack: ProjectStackSchema.partial().optional(),
  manifest: ProjectManifestSchema.partial().optional(),
  cfFindings: CFFindingsSchema.partial().optional(),
  rawDependencies: z.record(z.string(), z.unknown()).optional(),
  rawMetadata: z.record(z.string(), z.unknown()).optional(),
});
export type PartialProjectProfile = z.infer<typeof PartialProjectProfileSchema>;

// ============================================================
// DATABASE ENTITY TYPES (matching SQL schema)
// ============================================================

export const ProjectEntitySchema = z.object({
  id: z.string(),
  owner_id: z.string(),
  name: z.string(),
  slug: z.string(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  scouting_enabled: z.boolean(),
  scouting_frequency: ScoutingFrequencySchema,
  max_recommendations: z.number().int(),
  focus_areas: z.array(z.string()),
  exclude_categories: z.array(z.string()),
  breaking_changes_enabled: z.boolean(),
  breaking_changes_alerts: z.array(z.string()),
  breaking_changes_delivery: z.string(),
  export_enabled: z.boolean(),
  export_formats: z.array(z.string()),
  export_frequency: z.string(),
  export_retention_days: z.number().int(),
  agent_config: AgentConfigSchema,
  notification_channels: z.array(NotificationChannelSchema),
});
export type ProjectEntity = z.infer<typeof ProjectEntitySchema>;

export const ProjectSourceEntitySchema = z.object({
  id: z.string(),
  project_id: z.string(),
  provider: SourceProviderSchema,
  connection_type: ConnectionTypeSchema,
  connection_config: SourceConnectionSchema,
  last_scan: z.string().datetime().nullable(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});
export type ProjectSourceEntity = z.infer<typeof ProjectSourceEntitySchema>;

export const ProjectTeamEntitySchema = z.object({
  id: z.string(),
  project_id: z.string(),
  user_id: z.string(),
  name: z.string(),
  role: TeamRoleSchema,
  receives_technical_brief: z.boolean(),
  receives_human_brief: z.boolean(),
  notification_channel: z.string(),
  created_at: z.string().datetime(),
});
export type ProjectTeamEntity = z.infer<typeof ProjectTeamEntitySchema>;

export const ProjectStackEntitySchema = z.object({
  id: z.string(),
  project_id: z.string(),
  languages: z.array(LanguageInfoSchema),
  frameworks: z.array(FrameworkInfoSchema),
  databases: z.array(DatabaseInfoSchema),
  infrastructure: InfrastructureInfoSchema,
  key_dependencies: z.array(KeyDependencySchema),
  all_dependencies: AllDependenciesSchema,
  updated_at: z.string().datetime(),
});
export type ProjectStackEntity = z.infer<typeof ProjectStackEntitySchema>;

export const ProjectManifestEntitySchema = z.object({
  id: z.string(),
  project_id: z.string(),
  phase: ProjectPhaseSchema,
  description: z.string().nullable(),
  objectives: z.array(z.string()),
  pain_points: z.array(z.string()),
  constraints: z.array(z.string()),
  open_to: z.array(z.string()),
  not_open_to: z.array(z.string()),
  updated_at: z.string().datetime(),
});
export type ProjectManifestEntity = z.infer<typeof ProjectManifestEntitySchema>;

export const CFFindingEntitySchema = z.object({
  id: z.string(),
  project_id: z.string(),
  finding_id: z.string(),
  layer: z.string(),
  category: z.string(),
  severity: CFSeveritySchema,
  pattern_id: z.string().nullable(),
  description: z.string(),
  files_affected: z.number().int(),
  ifx_tag: z.enum(['FACT', 'INFERENCE']),
  is_resolved: z.boolean(),
  resolved_by_recommendation: z.string().nullable(),
  resolved_at: z.string().datetime().nullable(),
  scan_version: z.string().nullable(),
  scanned_at: z.string().datetime(),
  created_at: z.string().datetime(),
});
export type CFFindingEntity = z.infer<typeof CFFindingEntitySchema>;

export const StackHealthEntitySchema = z.object({
  id: z.string(),
  project_id: z.string(),
  overall_score: z.number().min(0).max(1),
  components: StackHealthComponentsSchema,
  last_calculated: z.string().datetime(),
});
export type StackHealthEntity = z.infer<typeof StackHealthEntitySchema>;
