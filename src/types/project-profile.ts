/**
 * TechScout — Project Profile Types v1.1
 *
 * Central contract of the system.
 * Any provider (GitHub, GitLab, local upload, CLI, etc.)
 * must produce an object conforming to this schema.
 * The Matching Engine consumes ONLY this format.
 */

import type { IFXGovernance } from './ifx';

// ============================================================
// ENUMS AND CONSTANTS
// ============================================================

export type ProjectPhase = 'mvp' | 'growth' | 'scale' | 'maintenance' | 'legacy';

export type TeamRole =
  | 'developer_frontend'
  | 'developer_backend'
  | 'developer_fullstack'
  | 'pm'
  | 'stakeholder'
  | 'other';

export type ScoutingFrequency = 'daily' | 'weekly' | 'biweekly' | 'monthly';

export type SourceProvider =
  | 'github'
  | 'gitlab'
  | 'bitbucket'
  | 'railway'
  | 'vercel'
  | 'local_upload'
  | 'cli_local'
  | 'manual_manifest';

export type ConnectionType = 'oauth' | 'token' | 'none';

export type LanguageRole = 'primary' | 'secondary' | 'config' | 'scripting';

export type FrameworkCategory =
  | 'frontend'
  | 'backend'
  | 'styling'
  | 'testing'
  | 'build'
  | 'other';

export type DependencyEcosystem =
  | 'npm'
  | 'pip'
  | 'cargo'
  | 'go'
  | 'maven'
  | 'nuget'
  | 'gems'
  | 'other';

export type CFSeverity = 'critical' | 'high' | 'medium' | 'low';

export type BreakingChangeAlertType =
  | 'major_version'
  | 'deprecation_notice'
  | 'security_advisory'
  | 'eol_announcement';

// ============================================================
// TEAM
// ============================================================

export interface TeamMember {
  userId: string;
  name: string;
  role: TeamRole;
  receivesTechnicalBrief: boolean;
  receivesHumanBrief: boolean;
  notificationChannel: 'email' | 'slack';
}

// ============================================================
// NOTIFICATION CHANNELS
// ============================================================

export interface NotificationChannel {
  type: 'email' | 'slack';
  target: string;
}

// ============================================================
// SCOUTING CONFIGURATION
// ============================================================

export interface BreakingChangesConfig {
  enabled: boolean;
  alertOn: BreakingChangeAlertType[];
  delivery: 'immediate' | 'next_brief';
  channels: NotificationChannel[];
}

export interface ExportConfig {
  enabled: boolean;
  format: ('pdf' | 'json' | 'markdown')[];
  frequency: 'after_each_brief' | 'weekly' | 'monthly';
  storage: 'supabase_storage' | 's3';
  retentionDays: number;
}

export interface AgentSafetyConfig {
  maxFilesModified: number;
  maxLinesChanged: number;
  maxExecutionTimeMinutes: number;
  complexityThreshold: number;
  requireTestsPass: boolean;
}

export interface AgentConfig {
  enabled: boolean;
  mode: 'assisted' | 'supervised';
  gitProvider: 'github' | 'gitlab' | 'bitbucket';
  baseBranch: string;
  branchPrefix: string;
  safety: AgentSafetyConfig;
}

export interface ScoutingConfig {
  enabled: boolean;
  frequency: ScoutingFrequency;
  maxRecommendations: number;
  focusAreas: string[];
  excludeCategories: string[];
  notificationChannels: NotificationChannel[];
  breakingChanges: BreakingChangesConfig;
  export: ExportConfig;
  agent: AgentConfig;
}

// ============================================================
// SOURCES (Multi-provider)
// ============================================================

export interface GitHubRepo {
  owner: string;
  name: string;
  branch: string;
}

export interface GitLabRepo {
  projectId: number;
  branch: string;
}

export interface SourceConnection {
  type: ConnectionType;
  instance?: string; // For GitLab self-hosted
  repos?: GitHubRepo[] | GitLabRepo[];
  projectId?: string; // For Railway, Vercel
  uploadId?: string; // For local_upload
  lastPush?: string; // For cli_local
  filesUploaded?: string[]; // For manual_manifest
}

export interface ProjectSource {
  provider: SourceProvider;
  connection: SourceConnection;
  lastScan: string | null;
}

// ============================================================
// STACK
// ============================================================

export interface LanguageInfo {
  name: string;
  percentage: number;
  role: LanguageRole;
}

export interface FrameworkInfo {
  name: string;
  version: string;
  category: FrameworkCategory;
}

export interface DatabaseInfo {
  name: string;
  version: string;
  provider?: string; // e.g., "Supabase", "Railway"
}

export interface HostingInfo {
  name: string;
  services: string[];
}

export interface InfrastructureInfo {
  hosting: HostingInfo[];
  ciCd: Array<{ name: string }>;
  containerization?: Array<{ name: string; version: string }>;
}

export interface KeyDependency {
  name: string;
  version: string;
  ecosystem: DependencyEcosystem;
  category: string; // e.g., "database_client", "ai_sdk", "auth"
}

export interface EcosystemDependencies {
  direct: number;
  dev: number;
  packages?: string[]; // Sample of package names
}

export interface AllDependencies {
  npm?: EcosystemDependencies;
  pip?: EcosystemDependencies;
  cargo?: EcosystemDependencies;
  go?: EcosystemDependencies;
  maven?: EcosystemDependencies;
  [key: string]: EcosystemDependencies | undefined;
}

export interface ProjectStack {
  languages: LanguageInfo[];
  frameworks: FrameworkInfo[];
  databases: DatabaseInfo[];
  infrastructure: InfrastructureInfo;
  keyDependencies: KeyDependency[];
  allDependencies: AllDependencies;
}

// ============================================================
// STACK HEALTH (for Stability Gate)
// ============================================================

export interface HealthComponentScore {
  score: number; // 0-1
  factors: string[];
}

export interface StackHealthComponents {
  security: HealthComponentScore;
  freshness: HealthComponentScore;
  maintenanceRisk: HealthComponentScore;
  complexity: HealthComponentScore;
}

export interface StackHealth {
  overallScore: number; // 0-1
  lastCalculated: string;
  components: StackHealthComponents;
}

// ============================================================
// MANIFEST (User-provided context)
// ============================================================

export interface ProjectManifest {
  phase: ProjectPhase;
  description: string;
  objectives: string[];
  painPoints: string[];
  constraints: string[];
  openTo: string[];
  notOpenTo: string[];
}

// ============================================================
// CODE FORENSICS FINDINGS
// ============================================================

export interface CFFinding {
  id: string; // e.g., "CF-2026-001"
  layer: string; // e.g., "L1"
  category: string; // e.g., "crypto", "auth", "compliance"
  severity: CFSeverity;
  patternId: string; // e.g., "CRYPTO-WEAK-HASH"
  description: string;
  filesAffected: number;
  ifxTag: 'FACT' | 'INFERENCE';
}

export interface CFScanSummary {
  totalFindings: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
}

export interface CFFindings {
  lastScan: string;
  scanVersion: string;
  summary: CFScanSummary;
  findings: CFFinding[];
}

// ============================================================
// COST TRACKING (for effort calibration)
// ============================================================

export interface AdoptionRecord {
  recommendationId: string;
  subject: string;
  estimatedDays: number;
  actualDays: number;
  notes?: string;
  adoptedAt: string;
}

export interface CostCalibration {
  totalAdoptions: number;
  avgEstimateAccuracy: number; // Ratio of actual/estimated
  biasDirection: 'underestimate' | 'overestimate' | 'balanced';
}

export interface CostTracking {
  adoptions: AdoptionRecord[];
  calibration: CostCalibration;
}

// ============================================================
// COMPLETE PROJECT PROFILE
// ============================================================

export interface Project {
  id: string;
  name: string;
  slug: string;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectProfile {
  project: Project;
  team: TeamMember[];
  scouting: ScoutingConfig;
  sources: ProjectSource[];
  stack: ProjectStack;
  stackHealth: StackHealth;
  manifest: ProjectManifest;
  cfFindings: CFFindings;
  costTracking: CostTracking;
  governance: IFXGovernance;
}

// ============================================================
// PARTIAL PROFILE (for provider output)
// ============================================================

/**
 * Partial profile produced by individual providers.
 * The normalizer combines these into a complete ProjectProfile.
 */
export interface PartialProjectProfile {
  source: SourceProvider;
  fetchedAt: string;

  // Only populated fields from this provider
  stack?: Partial<ProjectStack>;
  manifest?: Partial<ProjectManifest>;
  cfFindings?: Partial<CFFindings>;

  // Raw data for further processing
  rawDependencies?: Record<string, unknown>;
  rawMetadata?: Record<string, unknown>;
}

// ============================================================
// DATABASE ENTITY TYPES (matching SQL schema)
// ============================================================

export interface ProjectEntity {
  id: string;
  owner_id: string;
  name: string;
  slug: string;
  created_at: string;
  updated_at: string;
  scouting_enabled: boolean;
  scouting_frequency: ScoutingFrequency;
  max_recommendations: number;
  focus_areas: string[];
  exclude_categories: string[];
  breaking_changes_enabled: boolean;
  breaking_changes_alerts: string[];
  breaking_changes_delivery: string;
  export_enabled: boolean;
  export_formats: string[];
  export_frequency: string;
  export_retention_days: number;
  agent_config: AgentConfig;
  notification_channels: NotificationChannel[];
}

export interface ProjectSourceEntity {
  id: string;
  project_id: string;
  provider: SourceProvider;
  connection_type: ConnectionType;
  connection_config: SourceConnection;
  last_scan: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectTeamEntity {
  id: string;
  project_id: string;
  user_id: string;
  name: string;
  role: TeamRole;
  receives_technical_brief: boolean;
  receives_human_brief: boolean;
  notification_channel: string;
  created_at: string;
}

export interface ProjectStackEntity {
  id: string;
  project_id: string;
  languages: LanguageInfo[];
  frameworks: FrameworkInfo[];
  databases: DatabaseInfo[];
  infrastructure: InfrastructureInfo;
  key_dependencies: KeyDependency[];
  all_dependencies: AllDependencies;
  updated_at: string;
}

export interface ProjectManifestEntity {
  id: string;
  project_id: string;
  phase: ProjectPhase;
  description: string | null;
  objectives: string[];
  pain_points: string[];
  constraints: string[];
  open_to: string[];
  not_open_to: string[];
  updated_at: string;
}

export interface CFFindingEntity {
  id: string;
  project_id: string;
  finding_id: string;
  layer: string;
  category: string;
  severity: CFSeverity;
  pattern_id: string | null;
  description: string;
  files_affected: number;
  ifx_tag: 'FACT' | 'INFERENCE';
  is_resolved: boolean;
  resolved_by_recommendation: string | null;
  resolved_at: string | null;
  scan_version: string | null;
  scanned_at: string;
  created_at: string;
}

export interface StackHealthEntity {
  id: string;
  project_id: string;
  overall_score: number;
  components: StackHealthComponents;
  last_calculated: string;
}
