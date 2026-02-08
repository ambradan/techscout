/**
 * TechScout — Supabase Client
 *
 * Provides Supabase client instances for different use cases:
 * - supabase: For authenticated user operations (respects RLS)
 * - supabaseAdmin: For service operations (bypasses RLS)
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import 'dotenv/config';

// ============================================================
// ENVIRONMENT VALIDATION
// ============================================================

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL) {
  throw new Error('Missing SUPABASE_URL environment variable');
}

if (!SUPABASE_ANON_KEY) {
  throw new Error('Missing SUPABASE_ANON_KEY environment variable');
}

// ============================================================
// CLIENT INSTANCES
// ============================================================

/**
 * Standard Supabase client for authenticated user operations.
 * Respects Row Level Security (RLS) policies.
 */
export const supabase: SupabaseClient = createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  {
    auth: {
      autoRefreshToken: true,
      persistSession: false,
    },
  }
);

/**
 * Admin Supabase client for service-level operations.
 * Bypasses Row Level Security (RLS) policies.
 * Use only for background jobs, migrations, and admin tasks.
 */
export const supabaseAdmin: SupabaseClient | null = SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })
  : null;

/**
 * Get the admin client or throw if not configured.
 * Use this when service role access is required.
 */
export function getAdminClient(): SupabaseClient {
  if (!supabaseAdmin) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is required for admin operations'
    );
  }
  return supabaseAdmin;
}

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

/**
 * Check if the database connection is healthy
 */
export async function checkDatabaseHealth(): Promise<{
  healthy: boolean;
  latencyMs: number;
  error?: string;
}> {
  const start = Date.now();
  try {
    const { error } = await supabase.from('projects').select('id').limit(1);
    const latencyMs = Date.now() - start;

    if (error) {
      return { healthy: false, latencyMs, error: error.message };
    }

    return { healthy: true, latencyMs };
  } catch (err) {
    const latencyMs = Date.now() - start;
    return {
      healthy: false,
      latencyMs,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

/**
 * Handle Supabase errors consistently
 */
export function handleSupabaseError(error: unknown): Error {
  if (error && typeof error === 'object' && 'message' in error) {
    const supabaseError = error as { message: string; code?: string };
    return new Error(
      `Supabase error: ${supabaseError.message}${supabaseError.code ? ` (code: ${supabaseError.code})` : ''}`
    );
  }
  return new Error('Unknown Supabase error');
}

// ============================================================
// DATABASE TYPES (for type-safe queries)
// ============================================================

/**
 * Database schema type for type-safe Supabase queries.
 * This should match the structure of your database tables.
 */
export interface Database {
  public: {
    Tables: {
      projects: {
        Row: {
          id: string;
          owner_id: string;
          name: string;
          slug: string;
          created_at: string;
          updated_at: string;
          scouting_enabled: boolean;
          scouting_frequency: string;
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
          agent_config: Record<string, unknown>;
          notification_channels: Record<string, unknown>[];
        };
        Insert: Omit<Database['public']['Tables']['projects']['Row'], 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['projects']['Insert']>;
      };
      project_sources: {
        Row: {
          id: string;
          project_id: string;
          provider: string;
          connection_type: string;
          connection_config: Record<string, unknown>;
          last_scan: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['project_sources']['Row'], 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['project_sources']['Insert']>;
      };
      project_team: {
        Row: {
          id: string;
          project_id: string;
          user_id: string;
          name: string;
          role: string;
          receives_technical_brief: boolean;
          receives_human_brief: boolean;
          notification_channel: string;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['project_team']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['project_team']['Insert']>;
      };
      project_stack: {
        Row: {
          id: string;
          project_id: string;
          languages: Record<string, unknown>[];
          frameworks: Record<string, unknown>[];
          databases: Record<string, unknown>[];
          infrastructure: Record<string, unknown>;
          key_dependencies: Record<string, unknown>[];
          all_dependencies: Record<string, unknown>;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['project_stack']['Row'], 'id' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['project_stack']['Insert']>;
      };
      project_manifest: {
        Row: {
          id: string;
          project_id: string;
          phase: string;
          description: string | null;
          objectives: string[];
          pain_points: string[];
          constraints: string[];
          open_to: string[];
          not_open_to: string[];
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['project_manifest']['Row'], 'id' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['project_manifest']['Insert']>;
      };
      cf_findings: {
        Row: {
          id: string;
          project_id: string;
          finding_id: string;
          layer: string;
          category: string;
          severity: string;
          pattern_id: string | null;
          description: string;
          files_affected: number;
          ifx_tag: string;
          is_resolved: boolean;
          resolved_by_recommendation: string | null;
          resolved_at: string | null;
          scan_version: string | null;
          scanned_at: string;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['cf_findings']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['cf_findings']['Insert']>;
      };
      stack_health: {
        Row: {
          id: string;
          project_id: string;
          overall_score: number;
          components: Record<string, unknown>;
          last_calculated: string;
        };
        Insert: Omit<Database['public']['Tables']['stack_health']['Row'], 'id'>;
        Update: Partial<Database['public']['Tables']['stack_health']['Insert']>;
      };
      feed_items: {
        Row: {
          id: string;
          source_name: string;
          source_tier: string;
          source_reliability: string;
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
          traction: Record<string, unknown>;
          is_processed: boolean;
          processed_at: string | null;
          content_hash: string | null;
        };
        Insert: Omit<Database['public']['Tables']['feed_items']['Row'], 'id'>;
        Update: Partial<Database['public']['Tables']['feed_items']['Insert']>;
      };
      recommendations: {
        Row: {
          id: string;
          project_id: string;
          feed_item_id: string | null;
          ifx_trace_id: string;
          model_used: string;
          generated_at: string;
          type: string;
          action: string;
          priority: string;
          confidence: number;
          subject: Record<string, unknown>;
          replaces: string | null;
          complements: string | null;
          enables: string | null;
          role_visibility: string[];
          stability_assessment: Record<string, unknown>;
          technical: Record<string, unknown>;
          human_friendly: Record<string, unknown>;
          kqr: Record<string, unknown>;
          is_delivered: boolean;
          delivered_at: string | null;
          delivery_channel: string | null;
          alert_type: string | null;
          alert_severity: string | null;
          action_required: string | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['recommendations']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['recommendations']['Insert']>;
      };
      recommendation_feedback: {
        Row: {
          id: string;
          recommendation_id: string;
          status: string;
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
        };
        Insert: Omit<Database['public']['Tables']['recommendation_feedback']['Row'], 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['recommendation_feedback']['Insert']>;
      };
      migration_jobs: {
        Row: {
          id: string;
          recommendation_id: string;
          project_id: string;
          ifx_trace_id: string;
          triggered_by: string;
          triggered_at: string;
          status: string;
          preflight: Record<string, unknown> | null;
          branch_name: string | null;
          created_from_sha: string | null;
          backup_commit_sha: string | null;
          plan: Record<string, unknown> | null;
          plan_status: string | null;
          plan_approved_by: string | null;
          plan_approved_at: string | null;
          execution: Record<string, unknown> | null;
          testing: Record<string, unknown> | null;
          report: Record<string, unknown> | null;
          pr_url: string | null;
          pr_number: number | null;
          pr_status: string | null;
          human_review_status: string;
          reviewer: string | null;
          reviewed_at: string | null;
          review_comments: string | null;
          merged_at: string | null;
          merged_by: string | null;
          merge_sha: string | null;
          safety_stopped: boolean;
          safety_stop_reason: string | null;
          safety_stop_at_step: number | null;
          started_at: string | null;
          completed_at: string | null;
          duration_minutes: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['migration_jobs']['Row'], 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['migration_jobs']['Insert']>;
      };
      audit_log: {
        Row: {
          id: string;
          migration_job_id: string | null;
          project_id: string | null;
          action: string;
          detail: string | null;
          actor: string | null;
          actor_type: string;
          timestamp: string;
          metadata: Record<string, unknown>;
        };
        Insert: Omit<Database['public']['Tables']['audit_log']['Row'], 'id' | 'timestamp'>;
        Update: never; // Audit log is append-only
      };
      brief_archive: {
        Row: {
          id: string;
          project_id: string;
          brief_type: string;
          format: string;
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
        };
        Insert: Omit<Database['public']['Tables']['brief_archive']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['brief_archive']['Insert']>;
      };
      governance_metadata: {
        Row: {
          id: string;
          project_id: string;
          ifx_version: string;
          kqr_version: string;
          last_profile_validation: string | null;
          profile_completeness_score: number;
          data_sources_used: Record<string, unknown>[];
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['governance_metadata']['Row'], 'id' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['governance_metadata']['Insert']>;
      };
      cost_tracking: {
        Row: {
          id: string;
          project_id: string;
          recommendation_id: string;
          subject: string;
          estimated_days: number;
          actual_days: number | null;
          notes: string | null;
          adopted_at: string;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['cost_tracking']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['cost_tracking']['Insert']>;
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
  };
}
