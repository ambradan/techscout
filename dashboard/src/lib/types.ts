/**
 * TypeScript types for TechScout Dashboard
 * Matches the Supabase database schema (migration 001)
 */

// Projects
export interface Project {
  id: string;
  owner_id: string;
  name: string;
  slug: string;
  description: string | null;
  scouting_enabled: boolean;
  focus_areas: string[];
  exclude_categories: string[];
  maturity_filter: 'conservative' | 'mainstream' | 'early_adopter' | 'bleeding_edge';
  max_recommendations: number;
  notification_channels: string[];
  created_at: string;
  updated_at: string;
}

// Project Stack
export interface ProjectStack {
  id: string;
  project_id: string;
  languages: LanguageInfo[];
  frameworks: FrameworkInfo[];
  databases: DatabaseInfo[];
  key_dependencies: KeyDependency[];
  all_dependencies: Record<string, DependencyGroup>;
  infrastructure: string[];
  dev_tools: string[];
  analyzed_at: string;
}

export interface LanguageInfo {
  name: string;
  percentage: number;
  role: 'primary' | 'secondary' | 'config' | 'scripting';
}

export interface FrameworkInfo {
  name: string;
  version?: string;
  category?: string;
}

export interface DatabaseInfo {
  name: string;
  role?: string;
}

export interface KeyDependency {
  name: string;
  version: string;
  ecosystem: 'npm' | 'pip' | 'cargo' | 'go' | 'gems' | 'other';
  category?: string;
}

export interface DependencyGroup {
  direct: number;
  dev: number;
  packages: string[];
}

// Project Manifest
export interface ProjectManifest {
  id: string;
  project_id: string;
  objectives: string[];
  pain_points: string[];
  constraints: string[];
  updated_at: string;
}

// Stack Health
export interface StackHealth {
  id: string;
  project_id: string;
  overall_score: number;
  components: {
    security: { score: number; details: string[] };
    freshness: { score: number; details: string[] };
    maintenance: { score: number; details: string[] };
    complexity: { score: number; details: string[] };
  };
  calculated_at: string;
}

// CF Findings
export interface CFinding {
  id: string;
  project_id: string;
  finding_id: string;
  category: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  description: string;
  pattern_id: string | null;
  is_resolved: boolean;
  scanned_at: string;
}

// Feed Items
export interface FeedItem {
  id: string;
  source_name: string;
  source_tier: 'tier1' | 'tier2' | 'tier3';
  source_reliability: 'very_high' | 'high' | 'medium' | 'low';
  external_id: string;
  title: string;
  url: string;
  description: string | null;
  content_summary: string | null;
  published_at: string;
  fetched_at: string;
  categories: string[];
  technologies: string[];
  language_ecosystems: string[];
  traction: TractionSignals;
  is_processed: boolean;
}

export interface TractionSignals {
  hnPoints?: number;
  githubStars?: number;
  githubStars30dGrowth?: number;
  phUpvotes?: number;
  npmWeeklyDownloads?: number;
  points?: number;
}

// Recommendations
export interface Recommendation {
  id: string;
  project_id: string;
  feed_item_id: string;
  ifx_trace_id: string;
  model_used: string;
  type: 'technology' | 'practice' | 'security' | 'migration';
  action: 'REPLACE' | 'COMPLEMENT' | 'NEW_CAPABILITY' | 'MONITOR';
  priority: 'critical' | 'high' | 'medium' | 'low' | 'info';
  confidence: number;
  subject: RecommendationSubject;
  replaces: string[] | null;
  complements: string[] | null;
  enables: string[] | null;
  role_visibility: string[];
  stability_assessment: StabilityAssessment;
  technical: TechnicalOutput;
  human_friendly: HumanFriendlyOutput;
  kqr: KQRData;
  status: 'pending' | 'reviewed' | 'accepted' | 'rejected' | 'implemented';
  created_at: string;
  updated_at: string;
}

export interface RecommendationSubject {
  name: string;
  type: 'library' | 'framework' | 'platform' | 'tool' | 'service' | 'pattern' | 'practice';
  url?: string;
  version?: string;
  ecosystem?: string;
  license?: string;
  maturity: string;
  traction?: TractionSignals;
}

export interface StabilityAssessment {
  verdict: 'RECOMMEND' | 'MONITOR' | 'DEFER';
  costOfChange: number;
  costOfNoChange: number;
  delta: number;
  factors: string[];
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
  failureModes: FailureMode[];
  limitations: string[];
}

export interface IFXFact {
  ifxTag: 'FACT';
  claim: string;
  source: string;
  sourceReliability: 'very_high' | 'high' | 'medium' | 'low';
  sourceUrl?: string;
  cfFindingId?: string;
}

export interface IFXInference {
  ifxTag: 'INFERENCE';
  claim: string;
  derivedFrom: string[];
  confidence: number;
}

export interface IFXAssumption {
  ifxTag: 'ASSUMPTION';
  claim: string;
}

export interface CalibratedEffort {
  rawEstimateDays: string;
  calibrationApplied: boolean;
  calibratedEstimateDays: string;
  complexity: 'trivial' | 'low' | 'medium' | 'high' | 'very_high';
  breakingChanges: boolean;
  reversibility: 'easy' | 'medium' | 'hard' | 'irreversible';
  steps: string[];
}

export interface TechnicalImpact {
  security: { scoreChange: string; detail: string };
  performance: { scoreChange: string; detail: string };
  maintainability: { scoreChange: string; detail: string };
  cost: { scoreChange: string; detail: string };
  risk: { level: 'none' | 'low' | 'medium' | 'high' | 'critical'; detail: string };
}

export interface FailureMode {
  mode: string;
  probability: 'low' | 'medium' | 'high';
  mitigation: string;
}

export interface HumanFriendlyOutput {
  title: string;
  oneLiner: string;
  summary: string;
  whyNow: string;
  clientTalkingPoints: { point: string; answer: string }[];
  impactSummary: {
    security: string;
    costo: string;
    rischio: string;
    urgenza: string;
  };
}

export interface KQRData {
  confidence: number;
  sources: string[];
  statement: string;
}

// Recommendation Feedback
export interface RecommendationFeedback {
  id: string;
  recommendation_id: string;
  user_id: string;
  feedback_type: 'USEFUL' | 'NOT_RELEVANT' | 'ALREADY_KNEW' | 'ADOPTED' | 'DISMISSED';
  adoption_actual_days: number | null;
  notes: string | null;
  created_at: string;
}

// Brief Archive
export interface BriefArchive {
  id: string;
  project_id: string;
  brief_type: 'technical' | 'human';
  file_path: string;
  file_format: 'pdf' | 'json' | 'markdown';
  recommendations_included: string[];
  metadata: Record<string, unknown>;
  created_at: string;
}

// Team Member
export interface TeamMember {
  id: string;
  project_id: string;
  user_id: string;
  role: 'owner' | 'admin' | 'developer' | 'viewer';
  invited_at: string;
  joined_at: string | null;
}
