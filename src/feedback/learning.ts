/**
 * TechScout — Learning Loop (Layer 5)
 *
 * Calibrates pre-filter weights based on user feedback.
 * - NOT_RELEVANT: decrease weight for category/source
 * - USEFUL/ADOPTED: increase weight for category/source
 *
 * Weights are stored in project_filter_weights table and read
 * by the pre-filter on subsequent runs.
 */

import { logger } from '../lib/logger';
import { getAdminClient } from '../db/client';

// ============================================================
// TYPES
// ============================================================

export type FeedbackType = 'USEFUL' | 'NOT_RELEVANT' | 'ADOPTED' | 'DISMISSED';
export type WeightType = 'category' | 'source' | 'technology';

export interface FilterWeight {
  projectId: string;
  weightType: WeightType;
  weightKey: string;
  weight: number;
  usefulCount: number;
  adoptedCount: number;
  notRelevantCount: number;
  lastFeedbackAt: string | null;
}

export interface FeedbackData {
  projectId: string;
  recommendationId: string;
  feedbackType: FeedbackType;
  categories: string[];
  source: string;
  technologies: string[];
}

export interface WeightAdjustment {
  weightType: WeightType;
  weightKey: string;
  oldWeight: number;
  newWeight: number;
  reason: string;
}

// ============================================================
// CONSTANTS
// ============================================================

// Weight adjustment factors
const USEFUL_BOOST = 0.05;      // +5% per useful feedback
const ADOPTED_BOOST = 0.10;    // +10% per adopted feedback
const NOT_RELEVANT_PENALTY = 0.08; // -8% per not relevant feedback

// Weight bounds
const MIN_WEIGHT = 0.2;  // Never reduce below 20%
const MAX_WEIGHT = 2.0;  // Never boost above 200%

// ============================================================
// WEIGHT CALCULATION
// ============================================================

/**
 * Calculate new weight based on feedback type.
 */
export function calculateNewWeight(
  currentWeight: number,
  feedbackType: FeedbackType
): number {
  let newWeight = currentWeight;

  switch (feedbackType) {
    case 'USEFUL':
      newWeight = currentWeight + USEFUL_BOOST;
      break;
    case 'ADOPTED':
      newWeight = currentWeight + ADOPTED_BOOST;
      break;
    case 'NOT_RELEVANT':
      newWeight = currentWeight - NOT_RELEVANT_PENALTY;
      break;
    case 'DISMISSED':
      // Dismissed doesn't affect weights (user saw it but didn't act)
      break;
  }

  // Clamp to bounds
  return Math.max(MIN_WEIGHT, Math.min(MAX_WEIGHT, newWeight));
}

/**
 * Calculate weight from feedback counts (for recalculation).
 */
export function calculateWeightFromCounts(
  usefulCount: number,
  adoptedCount: number,
  notRelevantCount: number
): number {
  const baseWeight = 1.0;
  const boost = (usefulCount * USEFUL_BOOST) + (adoptedCount * ADOPTED_BOOST);
  const penalty = notRelevantCount * NOT_RELEVANT_PENALTY;

  const weight = baseWeight + boost - penalty;
  return Math.max(MIN_WEIGHT, Math.min(MAX_WEIGHT, weight));
}

// ============================================================
// DATABASE OPERATIONS
// ============================================================

/**
 * Get or create a filter weight record.
 */
async function getOrCreateWeight(
  projectId: string,
  weightType: WeightType,
  weightKey: string
): Promise<FilterWeight> {
  const admin = getAdminClient();

  // Try to get existing
  const { data: existing, error: selectError } = await admin
    .from('project_filter_weights')
    .select('*')
    .eq('project_id', projectId)
    .eq('weight_type', weightType)
    .eq('weight_key', weightKey)
    .single();

  if (existing && !selectError) {
    return {
      projectId: existing.project_id,
      weightType: existing.weight_type,
      weightKey: existing.weight_key,
      weight: parseFloat(existing.weight),
      usefulCount: existing.useful_count,
      adoptedCount: existing.adopted_count,
      notRelevantCount: existing.not_relevant_count,
      lastFeedbackAt: existing.last_feedback_at,
    };
  }

  // Create new with default weight
  const { data: created, error: insertError } = await admin
    .from('project_filter_weights')
    .insert({
      project_id: projectId,
      weight_type: weightType,
      weight_key: weightKey,
      weight: 1.0,
      useful_count: 0,
      adopted_count: 0,
      not_relevant_count: 0,
    })
    .select('*')
    .single();

  if (insertError) {
    // Handle race condition - try select again
    const { data: retry } = await admin
      .from('project_filter_weights')
      .select('*')
      .eq('project_id', projectId)
      .eq('weight_type', weightType)
      .eq('weight_key', weightKey)
      .single();

    if (retry) {
      return {
        projectId: retry.project_id,
        weightType: retry.weight_type,
        weightKey: retry.weight_key,
        weight: parseFloat(retry.weight),
        usefulCount: retry.useful_count,
        adoptedCount: retry.adopted_count,
        notRelevantCount: retry.not_relevant_count,
        lastFeedbackAt: retry.last_feedback_at,
      };
    }

    throw new Error(`Failed to create filter weight: ${insertError.message}`);
  }

  return {
    projectId: created.project_id,
    weightType: created.weight_type,
    weightKey: created.weight_key,
    weight: parseFloat(created.weight),
    usefulCount: created.useful_count,
    adoptedCount: created.adopted_count,
    notRelevantCount: created.not_relevant_count,
    lastFeedbackAt: created.last_feedback_at,
  };
}

/**
 * Update a filter weight with new feedback.
 */
async function updateWeight(
  projectId: string,
  weightType: WeightType,
  weightKey: string,
  feedbackType: FeedbackType
): Promise<WeightAdjustment> {
  const admin = getAdminClient();

  // Get current weight
  const current = await getOrCreateWeight(projectId, weightType, weightKey);
  const newWeight = calculateNewWeight(current.weight, feedbackType);

  // Calculate new counts
  const newUseful = current.usefulCount + (feedbackType === 'USEFUL' ? 1 : 0);
  const newAdopted = current.adoptedCount + (feedbackType === 'ADOPTED' ? 1 : 0);
  const newNotRelevant = current.notRelevantCount + (feedbackType === 'NOT_RELEVANT' ? 1 : 0);

  // Update in database
  const { error } = await admin
    .from('project_filter_weights')
    .update({
      weight: newWeight,
      useful_count: newUseful,
      adopted_count: newAdopted,
      not_relevant_count: newNotRelevant,
      last_feedback_at: new Date().toISOString(),
    })
    .eq('project_id', projectId)
    .eq('weight_type', weightType)
    .eq('weight_key', weightKey);

  if (error) {
    throw new Error(`Failed to update weight: ${error.message}`);
  }

  return {
    weightType,
    weightKey,
    oldWeight: current.weight,
    newWeight,
    reason: `${feedbackType} feedback`,
  };
}

// ============================================================
// MAIN FUNCTIONS
// ============================================================

/**
 * Process feedback and update filter weights.
 */
export async function processFeedback(
  feedback: FeedbackData
): Promise<WeightAdjustment[]> {
  const adjustments: WeightAdjustment[] = [];

  logger.info('Processing feedback for learning loop', {
    projectId: feedback.projectId,
    feedbackType: feedback.feedbackType,
    categories: feedback.categories,
    source: feedback.source,
    technologies: feedback.technologies.length,
  });

  try {
    // Update source weight
    if (feedback.source) {
      const adj = await updateWeight(
        feedback.projectId,
        'source',
        feedback.source.toLowerCase(),
        feedback.feedbackType
      );
      if (adj.oldWeight !== adj.newWeight) {
        adjustments.push(adj);
      }
    }

    // Update category weights
    for (const category of feedback.categories) {
      const adj = await updateWeight(
        feedback.projectId,
        'category',
        category.toLowerCase(),
        feedback.feedbackType
      );
      if (adj.oldWeight !== adj.newWeight) {
        adjustments.push(adj);
      }
    }

    // Update technology weights
    for (const tech of feedback.technologies) {
      const adj = await updateWeight(
        feedback.projectId,
        'technology',
        tech.toLowerCase(),
        feedback.feedbackType
      );
      if (adj.oldWeight !== adj.newWeight) {
        adjustments.push(adj);
      }
    }

    logger.info('Feedback processed', {
      projectId: feedback.projectId,
      adjustments: adjustments.length,
    });

    return adjustments;
  } catch (error) {
    logger.error('Failed to process feedback', {
      projectId: feedback.projectId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Load all filter weights for a project.
 */
export async function loadProjectWeights(
  projectId: string
): Promise<Map<string, number>> {
  const admin = getAdminClient();

  const { data, error } = await admin
    .from('project_filter_weights')
    .select('weight_type, weight_key, weight')
    .eq('project_id', projectId);

  if (error) {
    logger.error('Failed to load project weights', { projectId, error: error.message });
    return new Map();
  }

  const weights = new Map<string, number>();
  for (const row of data || []) {
    // Key format: "type:key" (e.g., "category:frontend", "source:hacker_news")
    const key = `${row.weight_type}:${row.weight_key}`;
    weights.set(key, parseFloat(row.weight));
  }

  logger.debug('Loaded project weights', { projectId, count: weights.size });
  return weights;
}

/**
 * Get weight for a specific item.
 */
export function getWeight(
  weights: Map<string, number>,
  weightType: WeightType,
  weightKey: string
): number {
  const key = `${weightType}:${weightKey.toLowerCase()}`;
  return weights.get(key) ?? 1.0;
}

/**
 * Calculate combined weight for a feed item.
 */
export function calculateCombinedWeight(
  weights: Map<string, number>,
  source: string,
  categories: string[],
  technologies: string[]
): number {
  // Get individual weights
  const sourceWeight = getWeight(weights, 'source', source);

  // Average category weights (if any)
  const categoryWeights = categories.map(c => getWeight(weights, 'category', c));
  const avgCategoryWeight = categoryWeights.length > 0
    ? categoryWeights.reduce((a, b) => a + b, 0) / categoryWeights.length
    : 1.0;

  // Average technology weights (if any)
  const techWeights = technologies.map(t => getWeight(weights, 'technology', t));
  const avgTechWeight = techWeights.length > 0
    ? techWeights.reduce((a, b) => a + b, 0) / techWeights.length
    : 1.0;

  // Combined weight (geometric mean to prevent runaway multiplication)
  const combined = Math.pow(sourceWeight * avgCategoryWeight * avgTechWeight, 1/3);

  return Math.max(MIN_WEIGHT, Math.min(MAX_WEIGHT, combined));
}

/**
 * Reset all weights for a project (useful for testing or fresh start).
 */
export async function resetProjectWeights(projectId: string): Promise<number> {
  const admin = getAdminClient();

  const { data, error } = await admin
    .from('project_filter_weights')
    .delete()
    .eq('project_id', projectId)
    .select('id');

  if (error) {
    throw new Error(`Failed to reset weights: ${error.message}`);
  }

  const count = data?.length || 0;
  logger.info('Project weights reset', { projectId, deleted: count });
  return count;
}

/**
 * Get weight statistics for a project.
 */
export async function getWeightStats(projectId: string): Promise<{
  total: number;
  byType: Record<string, number>;
  highestBoost: { key: string; weight: number } | null;
  lowestWeight: { key: string; weight: number } | null;
}> {
  const admin = getAdminClient();

  const { data, error } = await admin
    .from('project_filter_weights')
    .select('weight_type, weight_key, weight')
    .eq('project_id', projectId);

  if (error || !data) {
    return {
      total: 0,
      byType: {},
      highestBoost: null,
      lowestWeight: null,
    };
  }

  const byType: Record<string, number> = {};
  let highestBoost: { key: string; weight: number } | null = null;
  let lowestWeight: { key: string; weight: number } | null = null;

  for (const row of data) {
    byType[row.weight_type] = (byType[row.weight_type] || 0) + 1;

    const weight = parseFloat(row.weight);
    const key = `${row.weight_type}:${row.weight_key}`;

    if (weight > 1.0 && (!highestBoost || weight > highestBoost.weight)) {
      highestBoost = { key, weight };
    }
    if (weight < 1.0 && (!lowestWeight || weight < lowestWeight.weight)) {
      lowestWeight = { key, weight };
    }
  }

  return {
    total: data.length,
    byType,
    highestBoost,
    lowestWeight,
  };
}
