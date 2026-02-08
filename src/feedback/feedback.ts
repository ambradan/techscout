/**
 * TechScout — Feedback Collection (Layer 5)
 *
 * Collects user feedback on recommendations.
 * Supports: USEFUL, NOT_RELEVANT, ALREADY_KNEW, ADOPTED, DISMISSED.
 * Tracks adoption with cost data for calibration.
 */

import { logger } from '../lib/logger';
import { supabase } from '../db/client';
import type {
  FeedbackStatus,
  RecommendationFeedback,
  RecommendationFeedbackEntity,
  CostTrackingFeedback,
} from '../types';

// ============================================================
// TYPES
// ============================================================

export interface SubmitFeedbackInput {
  recommendationId: string;
  status: FeedbackStatus;
  userNotes?: string;
  submittedBy: string;
}

export interface SubmitAdoptionInput {
  recommendationId: string;
  submittedBy: string;
  userNotes?: string;
  adoptedAt?: string;
  costTracking?: CostTrackingFeedback;
  adoptionOutcome?: Record<string, unknown>;
}

export interface UpdateFeedbackInput {
  feedbackId: string;
  status?: FeedbackStatus;
  userNotes?: string;
  costTracking?: CostTrackingFeedback;
  adoptionOutcome?: Record<string, unknown>;
}

export interface FeedbackResult {
  success: boolean;
  feedback?: RecommendationFeedback;
  error?: string;
}

export interface FeedbackListOptions {
  projectId?: string;
  status?: FeedbackStatus | FeedbackStatus[];
  submittedBy?: string;
  limit?: number;
  offset?: number;
  orderBy?: 'submitted_at' | 'created_at' | 'updated_at';
  orderDirection?: 'asc' | 'desc';
}

// ============================================================
// ENTITY CONVERSION
// ============================================================

function entityToFeedback(entity: RecommendationFeedbackEntity): RecommendationFeedback {
  return {
    id: entity.id,
    recommendationId: entity.recommendation_id,
    status: entity.status,
    userNotes: entity.user_notes || undefined,
    submittedBy: entity.submitted_by || undefined,
    submittedAt: entity.submitted_at || undefined,
    costTracking: entity.actual_days ? {
      actualDays: entity.actual_days || undefined,
      actualComplexity: entity.actual_complexity as CostTrackingFeedback['actualComplexity'],
      notes: entity.adoption_notes || undefined,
      unexpectedIssues: entity.unexpected_issues || undefined,
    } : undefined,
    adoptedAt: entity.adopted_at || undefined,
    adoptionOutcome: entity.adoption_outcome || undefined,
  };
}

// ============================================================
// FEEDBACK COLLECTION
// ============================================================

/**
 * Submit feedback on a recommendation.
 */
export async function submitFeedback(
  input: SubmitFeedbackInput
): Promise<FeedbackResult> {
  logger.info('Submitting feedback', {
    recommendationId: input.recommendationId,
    status: input.status,
    submittedBy: input.submittedBy,
  });

  try {
    // Check if feedback already exists
    const { data: existing } = await supabase
      .from('recommendation_feedback')
      .select('id')
      .eq('recommendation_id', input.recommendationId)
      .single();

    let result;

    if (existing) {
      // Update existing feedback
      const { data, error } = await supabase
        .from('recommendation_feedback')
        .update({
          status: input.status,
          user_notes: input.userNotes,
          submitted_by: input.submittedBy,
          submitted_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .select()
        .single();

      if (error) throw new Error(error.message);
      result = data;
    } else {
      // Create new feedback
      const { data, error } = await supabase
        .from('recommendation_feedback')
        .insert({
          recommendation_id: input.recommendationId,
          status: input.status,
          user_notes: input.userNotes,
          submitted_by: input.submittedBy,
          submitted_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) throw new Error(error.message);
      result = data;
    }

    const feedback = entityToFeedback(result as RecommendationFeedbackEntity);

    logger.info('Feedback submitted', {
      feedbackId: feedback.id,
      status: feedback.status,
    });

    return { success: true, feedback };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('Failed to submit feedback', { error: errorMsg });
    return { success: false, error: errorMsg };
  }
}

/**
 * Submit adoption feedback with cost tracking data.
 */
export async function submitAdoption(
  input: SubmitAdoptionInput
): Promise<FeedbackResult> {
  logger.info('Submitting adoption', {
    recommendationId: input.recommendationId,
    submittedBy: input.submittedBy,
    hasActualDays: !!input.costTracking?.actualDays,
  });

  try {
    // Check if feedback already exists
    const { data: existing } = await supabase
      .from('recommendation_feedback')
      .select('id')
      .eq('recommendation_id', input.recommendationId)
      .single();

    const adoptionData = {
      status: 'adopted' as FeedbackStatus,
      user_notes: input.userNotes,
      submitted_by: input.submittedBy,
      submitted_at: new Date().toISOString(),
      adopted_at: input.adoptedAt || new Date().toISOString(),
      actual_days: input.costTracking?.actualDays,
      actual_complexity: input.costTracking?.actualComplexity,
      adoption_notes: input.costTracking?.notes,
      unexpected_issues: input.costTracking?.unexpectedIssues,
      adoption_outcome: input.adoptionOutcome,
    };

    let result;

    if (existing) {
      const { data, error } = await supabase
        .from('recommendation_feedback')
        .update(adoptionData)
        .eq('id', existing.id)
        .select()
        .single();

      if (error) throw new Error(error.message);
      result = data;
    } else {
      const { data, error } = await supabase
        .from('recommendation_feedback')
        .insert({
          recommendation_id: input.recommendationId,
          ...adoptionData,
        })
        .select()
        .single();

      if (error) throw new Error(error.message);
      result = data;
    }

    const feedback = entityToFeedback(result as RecommendationFeedbackEntity);

    logger.info('Adoption submitted', {
      feedbackId: feedback.id,
      actualDays: input.costTracking?.actualDays,
    });

    return { success: true, feedback };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('Failed to submit adoption', { error: errorMsg });
    return { success: false, error: errorMsg };
  }
}

/**
 * Update existing feedback.
 */
export async function updateFeedback(
  input: UpdateFeedbackInput
): Promise<FeedbackResult> {
  logger.info('Updating feedback', {
    feedbackId: input.feedbackId,
  });

  try {
    const updateData: Record<string, unknown> = {};

    if (input.status) {
      updateData.status = input.status;
      updateData.submitted_at = new Date().toISOString();
    }

    if (input.userNotes !== undefined) {
      updateData.user_notes = input.userNotes;
    }

    if (input.costTracking) {
      if (input.costTracking.actualDays !== undefined) {
        updateData.actual_days = input.costTracking.actualDays;
      }
      if (input.costTracking.actualComplexity !== undefined) {
        updateData.actual_complexity = input.costTracking.actualComplexity;
      }
      if (input.costTracking.notes !== undefined) {
        updateData.adoption_notes = input.costTracking.notes;
      }
      if (input.costTracking.unexpectedIssues !== undefined) {
        updateData.unexpected_issues = input.costTracking.unexpectedIssues;
      }
    }

    if (input.adoptionOutcome !== undefined) {
      updateData.adoption_outcome = input.adoptionOutcome;
    }

    const { data, error } = await supabase
      .from('recommendation_feedback')
      .update(updateData)
      .eq('id', input.feedbackId)
      .select()
      .single();

    if (error) throw new Error(error.message);

    const feedback = entityToFeedback(data as RecommendationFeedbackEntity);

    logger.info('Feedback updated', {
      feedbackId: feedback.id,
      status: feedback.status,
    });

    return { success: true, feedback };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('Failed to update feedback', { error: errorMsg });
    return { success: false, error: errorMsg };
  }
}

// ============================================================
// FEEDBACK RETRIEVAL
// ============================================================

/**
 * Get feedback for a specific recommendation.
 */
export async function getFeedback(
  recommendationId: string
): Promise<RecommendationFeedback | null> {
  const { data, error } = await supabase
    .from('recommendation_feedback')
    .select('*')
    .eq('recommendation_id', recommendationId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null;
    }
    throw new Error(`Failed to get feedback: ${error.message}`);
  }

  return entityToFeedback(data as RecommendationFeedbackEntity);
}

/**
 * Get feedback by ID.
 */
export async function getFeedbackById(
  feedbackId: string
): Promise<RecommendationFeedback | null> {
  const { data, error } = await supabase
    .from('recommendation_feedback')
    .select('*')
    .eq('id', feedbackId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null;
    }
    throw new Error(`Failed to get feedback: ${error.message}`);
  }

  return entityToFeedback(data as RecommendationFeedbackEntity);
}

/**
 * List feedback with filters.
 */
export async function listFeedback(
  options?: FeedbackListOptions
): Promise<RecommendationFeedback[]> {
  let query = supabase
    .from('recommendation_feedback')
    .select(`
      *,
      recommendations!inner(project_id)
    `);

  if (options?.projectId) {
    query = query.eq('recommendations.project_id', options.projectId);
  }

  if (options?.status) {
    if (Array.isArray(options.status)) {
      query = query.in('status', options.status);
    } else {
      query = query.eq('status', options.status);
    }
  }

  if (options?.submittedBy) {
    query = query.eq('submitted_by', options.submittedBy);
  }

  const orderBy = options?.orderBy || 'submitted_at';
  const orderDirection = options?.orderDirection || 'desc';
  query = query.order(orderBy, { ascending: orderDirection === 'asc' });

  if (options?.limit) {
    query = query.limit(options.limit);
  }

  if (options?.offset) {
    query = query.range(options.offset, options.offset + (options.limit || 50) - 1);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to list feedback: ${error.message}`);
  }

  return data.map(row => entityToFeedback(row as RecommendationFeedbackEntity));
}

/**
 * Get all adopted recommendations for a project.
 */
export async function getAdoptedRecommendations(
  projectId: string
): Promise<RecommendationFeedback[]> {
  return listFeedback({
    projectId,
    status: 'adopted',
    orderBy: 'submitted_at',
    orderDirection: 'desc',
  });
}

/**
 * Get pending feedback (recommendations awaiting feedback).
 */
export async function getPendingFeedback(
  projectId: string
): Promise<RecommendationFeedback[]> {
  return listFeedback({
    projectId,
    status: 'pending',
    orderBy: 'created_at',
    orderDirection: 'asc',
  });
}

// ============================================================
// BULK OPERATIONS
// ============================================================

/**
 * Mark multiple recommendations as not relevant.
 */
export async function bulkMarkNotRelevant(
  recommendationIds: string[],
  submittedBy: string,
  reason?: string
): Promise<{ success: number; failed: number }> {
  let success = 0;
  let failed = 0;

  for (const recId of recommendationIds) {
    const result = await submitFeedback({
      recommendationId: recId,
      status: 'not_relevant',
      submittedBy,
      userNotes: reason,
    });

    if (result.success) {
      success++;
    } else {
      failed++;
    }
  }

  logger.info('Bulk mark not relevant complete', { success, failed });

  return { success, failed };
}

/**
 * Mark multiple recommendations as dismissed.
 */
export async function bulkDismiss(
  recommendationIds: string[],
  submittedBy: string,
  reason?: string
): Promise<{ success: number; failed: number }> {
  let success = 0;
  let failed = 0;

  for (const recId of recommendationIds) {
    const result = await submitFeedback({
      recommendationId: recId,
      status: 'dismissed',
      submittedBy,
      userNotes: reason,
    });

    if (result.success) {
      success++;
    } else {
      failed++;
    }
  }

  logger.info('Bulk dismiss complete', { success, failed });

  return { success, failed };
}

// ============================================================
// QUICK FEEDBACK SHORTCUTS
// ============================================================

/**
 * Mark a recommendation as useful.
 */
export async function markUseful(
  recommendationId: string,
  submittedBy: string,
  notes?: string
): Promise<FeedbackResult> {
  return submitFeedback({
    recommendationId,
    status: 'useful',
    submittedBy,
    userNotes: notes,
  });
}

/**
 * Mark a recommendation as not relevant.
 */
export async function markNotRelevant(
  recommendationId: string,
  submittedBy: string,
  reason?: string
): Promise<FeedbackResult> {
  return submitFeedback({
    recommendationId,
    status: 'not_relevant',
    submittedBy,
    userNotes: reason,
  });
}

/**
 * Mark a recommendation as already known.
 */
export async function markAlreadyKnew(
  recommendationId: string,
  submittedBy: string,
  notes?: string
): Promise<FeedbackResult> {
  return submitFeedback({
    recommendationId,
    status: 'already_knew',
    submittedBy,
    userNotes: notes,
  });
}

/**
 * Dismiss a recommendation.
 */
export async function dismissRecommendation(
  recommendationId: string,
  submittedBy: string,
  reason?: string
): Promise<FeedbackResult> {
  return submitFeedback({
    recommendationId,
    status: 'dismissed',
    submittedBy,
    userNotes: reason,
  });
}
