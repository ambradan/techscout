/**
 * TypeScript types for TechScout Dashboard
 * ALIGNED with Supabase database schema (migration 001_initial_schema.sql)
 */

// ============================================================
// PROJECTS
// ============================================================
export interface Project {
  id: string;
  owner_id: string;
  name: string;
  slug: string;
  created_at: string;
  updated_at: string;
  // Scouting configuration
  scouting_enabled: boolean;
  scouting_frequency: 'daily' | 'weekly' | 'biweekly' | 'monthly';
  max_recommendations: number;
  focus_areas: string[];
  exclude_categories: string[];
  // Breaking changes configuration
  breaking_changes_enabled: boolean;
  breaking_changes_alerts: string[];
  breaking_changes_delivery: string;
  // Export configuration
  export_enabled: boolean;
  export_formats: string[];
  export_frequency: string;
  export_retention_days: number;
  // Agent configuration (JSONB)
  agent_config: {
    enabled: boolean;
    mode: string;
  };
  // Notification channels (JSONB array)
  notification_channels: unknown[];
}

// ============================================================
// PROJECT_STACK
// ============================================================
export interface ProjectStack {
  id: string;
  project_id: string;
  languages: LanguageInfo[];        // JSONB array
  frameworks: FrameworkInfo[];      // JSONB array
  databases: DatabaseInfo[];        // JSONB array
  infrastructure: Record<string, unknown>; // JSONB object
  key_dependencies: KeyDependency[]; // JSONB array
  all_dependencies: Record<string, DependencyGroup>; // JSONB object
  updated_at: string;
}

export interface LanguageInfo {
  name: string;
  percentage: number;
  role: 'primary' | 'secondary' | 'config' | 'scripting';
}

export interface FrameworkInfo {
  name: string;
  version?: string;
  category?: 'frontend' | 'backend' | 'styling' | 'testing' | 'build' | 'other';
}

export interface DatabaseInfo {
  name: string;
  role?: string;
}

export interface KeyDependency {
  name: string;
  version: string;
  ecosystem: 'npm' | 'pip' | 'cargo' | 'go' | 'maven' | 'nuget' | 'gems' | 'other';
  category?: string;
}

export interface DependencyGroup {
  direct: number;
  dev: number;
  packages?: string[];
}

// ============================================================
// PROJECT_MANIFEST
// ============================================================
export interface ProjectManifest {
  id: string;
  project_id: string;
  phase: 'mvp' | 'growth' | 'scale' | 'maintenance' | 'legacy';
  description: string | null;
  objectives: string[];
  pain_points: string[];
  constraints: string[];
  open_to: string[];
  not_open_to: string[];
  updated_at: string;
}

// ============================================================
// STACK_HEALTH
// ============================================================
export interface StackHealth {
  id: string;
  project_id: string;
  overall_score: number;
  components: Record<string, { score: number; factors?: string[] }>;
  last_calculated: string;  // DB column name
}

// ============================================================
// CF_FINDINGS
// ============================================================
export interface CFinding {
  id: string;
  project_id: string;
  finding_id: string;
  layer: string;
  category: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  pattern_id: string | null;
  description: string;
  files_affected: number;
  ifx_tag: 'FACT' | 'INFERENCE' | 'ASSUMPTION';
  is_resolved: boolean;
  resolved_by_recommendation: string | null;
  resolved_at: string | null;
  scan_version: string | null;
  scanned_at: string;
  created_at: string;
}

// ============================================================
// FEED_ITEMS
// ============================================================
export interface FeedItem {
  id: string;
  source_name: string;
  source_tier: 'tier1_high_signal' | 'tier2_curated' | 'tier3_community' | 'conditional';
  source_reliability: 'very_high' | 'high' | 'medium' | 'low';
  external_id: string | null;
  title: string;
  url: string | null;
  description: string | null;
  content_summary: string | null;
  published_at: string | null;
  fetched_at: string;
  categories: string[];
  technologies: string[];
  language_ecosystems: string[];
  traction: TractionSignals;
  is_processed: boolean;
  processed_at: string | null;
  content_hash: string | null;
}

export interface TractionSignals {
  points?: number;
  comments?: number;
  stars?: number;
  hnPoints?: number;
  githubStars?: number;
  githubStars30dGrowth?: number;
  phUpvotes?: number;
  npmWeeklyDownloads?: number;
}

// ============================================================
// RECOMMENDATIONS
// ============================================================
export interface Recommendation {
  id: string;
  project_id: string;
  feed_item_id: string | null;
  ifx_trace_id: string;
  model_used: string;
  generated_at: string;
  type: 'recommendation' | 'breaking_change_alert';
  action: 'REPLACE_EXISTING' | 'COMPLEMENT' | 'NEW_CAPABILITY' | 'MONITOR';
  priority: 'critical' | 'high' | 'medium' | 'low' | 'info';
  confidence: number;
  subject: RecommendationSubject;
  replaces: string | null;       // TEXT, not array
  complements: string | null;    // TEXT, not array
  enables: string | null;        // TEXT, not array
  role_visibility: string[];
  stability_assessment: StabilityAssessment;
  technical: TechnicalOutput;
  human_friendly: HumanFriendlyOutput;
  kqr: KQRData;
  // Delivery state
  is_delivered: boolean;
  delivered_at: string | null;
  delivery_channel: string | null;
  // Breaking change alert fields
  alert_type: 'major_version' | 'deprecation_notice' | 'security_advisory' | 'eol_announcement' | null;
  alert_severity: 'critical' | 'high' | 'medium' | 'low' | 'info' | null;
  action_required: string | null;
  created_at: string;
}

export interface RecommendationSubject {
  name: string;
  type: 'library' | 'framework' | 'platform' | 'tool' | 'service' | 'pattern' | 'practice';
  url?: string;
  version?: string;
  ecosystem?: string;
  license?: string;
  maturity?: 'experimental' | 'growth' | 'stable' | 'declining' | 'deprecated';
  traction?: TractionSignals;
}

export interface StabilityAssessment {
  cost_of_change: Record<string, unknown>;
  cost_of_no_change: Record<string, unknown>;
  maturity_gate: Record<string, unknown>;
  stack_health_influence: Record<string, unknown>;
  verdict: 'RECOMMEND' | 'MONITOR' | 'DEFER';
}

export interface TechnicalOutput {
  analysis: {
    facts: IFXFact[];
    inferences: IFXInference[];
    assumptions: IFXAssumption[];
  };
  effort: CalibratedEffort;
  impact: TechnicalImpact;
  tradeoffs: { gains: string[]; losses: string[] };
  failure_modes: FailureMode[];
  limitations: string[];
}

export interface IFXFact {
  ifx_tag: 'FACT';
  claim: string;
  source: string;
  source_reliability: 'very_high' | 'high' | 'medium' | 'low';
  source_url?: string;
  cf_finding_id?: string;
}

export interface IFXInference {
  ifx_tag: 'INFERENCE';
  claim: string;
  derived_from: string[];
  confidence: number;
}

export interface IFXAssumption {
  ifx_tag: 'ASSUMPTION';
  claim: string;
}

export interface CalibratedEffort {
  raw_estimate_days: string;
  calibration_applied: boolean;
  calibrated_estimate_days: string;
  complexity: 'trivial' | 'low' | 'medium' | 'high' | 'very_high';
  breaking_changes: boolean;
  reversibility: 'easy' | 'medium' | 'hard' | 'irreversible';
  steps: string[];
}

export interface TechnicalImpact {
  security: { score_change: string; detail: string };
  performance: { score_change: string; detail: string };
  maintainability: { score_change: string; detail: string };
  cost: { score_change: string; detail: string };
  risk: { level: 'none' | 'low' | 'medium' | 'high' | 'critical'; detail: string };
}

export interface FailureMode {
  mode: string;
  probability: 'low' | 'medium' | 'high';
  mitigation: string;
}

export interface HumanFriendlyOutput {
  title: string;
  one_liner: string;
  summary: string;
  why_now: string;
  client_talking_points: { point: string; answer: string }[];
  impact_summary: {
    security: string;
    costo: string;
    rischio: string;
    urgenza: string;
  };
}

export interface KQRData {
  overall_confidence: number;
  sources_used: string[];
  cross_validation: Record<string, unknown>;
  confidence_breakdown: Record<string, unknown>;
  qualification_statement: string;
}

// ============================================================
// RECOMMENDATION_FEEDBACK
// ============================================================
export interface RecommendationFeedback {
  id: string;
  recommendation_id: string;
  status: 'pending' | 'useful' | 'not_relevant' | 'already_knew' | 'adopted' | 'dismissed';
  user_notes: string | null;
  submitted_by: string | null;
  submitted_at: string | null;
  actual_days: number | null;
  actual_complexity: string | null;
  unexpected_issues: string | null;
  adoption_notes: string | null;
  adopted_at: string | null;
  adoption_outcome: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

// ============================================================
// BRIEF_ARCHIVE
// ============================================================
export interface BriefArchive {
  id: string;
  project_id: string;
  brief_type: 'technical' | 'human_friendly' | 'combined';
  format: 'pdf' | 'json' | 'markdown';
  file_path: string | null;
  file_size_bytes: number | null;
  recommendation_ids: string[];
  recommendation_count: number;
  period_start: string;
  period_end: string;
  delivered_to: string[] | null;
  delivered_at: string | null;
  created_at: string;
  expires_at: string | null;
}

// ============================================================
// PROJECT_TEAM
// ============================================================
export interface TeamMember {
  id: string;
  project_id: string;
  user_id: string;
  name: string;
  role: 'developer_frontend' | 'developer_backend' | 'developer_fullstack' | 'pm' | 'stakeholder' | 'other';
  receives_technical_brief: boolean;
  receives_human_brief: boolean;
  notification_channel: string;
  created_at: string;
}
