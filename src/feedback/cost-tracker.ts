/**
 * TechScout — Cost Tracking (Layer 5)
 *
 * Tracks actual implementation effort vs estimated.
 * Provides calibration data for the Stability Gate.
 * Stores historical adoption data for estimate accuracy improvement.
 */

import { logger } from '../lib/logger';
import { supabase } from '../db/client';
import type {
  AdoptionRecord,
  CostCalibration,
  CostTracking,
  CostTrackingFeedback,
} from '../types';

// ============================================================
// TYPES
// ============================================================

export interface CostTrackingEntry {
  id: string;
  projectId: string;
  recommendationId: string;
  subject: string;
  estimatedDays: number;
  actualDays: number;
  adoptedAt: string;
  createdAt: string;
}

export interface RecordAdoptionCostInput {
  projectId: string;
  recommendationId: string;
  subject: string;
  estimatedDays: number;
  actualDays: number;
  notes?: string;
  adoptedAt?: string;
}

export interface CalibrationResult {
  projectId: string;
  calibration: CostCalibration;
  adoptions: AdoptionRecord[];
  lastUpdated: string;
}

export interface AccuracyReport {
  projectId: string;
  totalAdoptions: number;
  avgEstimateAccuracy: number;
  biasDirection: 'underestimate' | 'overestimate' | 'balanced';
  accuracyByComplexity: Record<string, number>;
  recentTrend: 'improving' | 'worsening' | 'stable';
  outliers: AdoptionRecord[];
}

// ============================================================
// ENTITY CONVERSION
// ============================================================

interface CostTrackingEntity {
  id: string;
  project_id: string;
  recommendation_id: string;
  subject: string;
  estimated_days: number;
  actual_days: number;
  adopted_at: string;
  created_at: string;
}

function entityToEntry(entity: CostTrackingEntity): CostTrackingEntry {
  return {
    id: entity.id,
    projectId: entity.project_id,
    recommendationId: entity.recommendation_id,
    subject: entity.subject,
    estimatedDays: entity.estimated_days,
    actualDays: entity.actual_days,
    adoptedAt: entity.adopted_at,
    createdAt: entity.created_at,
  };
}

function entryToAdoptionRecord(entry: CostTrackingEntry): AdoptionRecord {
  return {
    recommendationId: entry.recommendationId,
    subject: entry.subject,
    estimatedDays: entry.estimatedDays,
    actualDays: entry.actualDays,
    adoptedAt: entry.adoptedAt,
  };
}

// ============================================================
// COST RECORDING
// ============================================================

/**
 * Record adoption cost data from feedback.
 */
export async function recordAdoptionCost(
  input: RecordAdoptionCostInput
): Promise<CostTrackingEntry> {
  logger.info('Recording adoption cost', {
    projectId: input.projectId,
    subject: input.subject,
    estimatedDays: input.estimatedDays,
    actualDays: input.actualDays,
  });

  const { data, error } = await supabase
    .from('cost_tracking')
    .insert({
      project_id: input.projectId,
      recommendation_id: input.recommendationId,
      subject: input.subject,
      estimated_days: input.estimatedDays,
      actual_days: input.actualDays,
      adopted_at: input.adoptedAt || new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    logger.error('Failed to record adoption cost', { error: error.message });
    throw new Error(`Failed to record adoption cost: ${error.message}`);
  }

  const entry = entityToEntry(data as CostTrackingEntity);

  logger.info('Adoption cost recorded', {
    entryId: entry.id,
    accuracy: entry.estimatedDays / entry.actualDays,
  });

  return entry;
}

/**
 * Record adoption cost from feedback submission.
 * This is called automatically when adoption feedback includes cost data.
 */
export async function recordFromFeedback(
  projectId: string,
  recommendationId: string,
  subject: string,
  estimatedDays: number,
  costTracking: CostTrackingFeedback,
  adoptedAt: string
): Promise<CostTrackingEntry | null> {
  if (!costTracking.actualDays) {
    return null;
  }

  return recordAdoptionCost({
    projectId,
    recommendationId,
    subject,
    estimatedDays,
    actualDays: costTracking.actualDays,
    notes: costTracking.notes,
    adoptedAt,
  });
}

// ============================================================
// COST RETRIEVAL
// ============================================================

/**
 * Get all cost tracking entries for a project.
 */
export async function getCostTrackingEntries(
  projectId: string,
  limit?: number
): Promise<CostTrackingEntry[]> {
  let query = supabase
    .from('cost_tracking')
    .select('*')
    .eq('project_id', projectId)
    .order('adopted_at', { ascending: false });

  if (limit) {
    query = query.limit(limit);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to get cost tracking entries: ${error.message}`);
  }

  return data.map(row => entityToEntry(row as CostTrackingEntity));
}

/**
 * Get cost tracking for a specific recommendation.
 */
export async function getCostForRecommendation(
  recommendationId: string
): Promise<CostTrackingEntry | null> {
  const { data, error } = await supabase
    .from('cost_tracking')
    .select('*')
    .eq('recommendation_id', recommendationId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null;
    }
    throw new Error(`Failed to get cost tracking: ${error.message}`);
  }

  return entityToEntry(data as CostTrackingEntity);
}

// ============================================================
// CALIBRATION CALCULATION
// ============================================================

/**
 * Calculate calibration data for a project.
 */
export function calculateCalibration(
  adoptions: AdoptionRecord[]
): CostCalibration {
  if (adoptions.length === 0) {
    return {
      totalAdoptions: 0,
      avgEstimateAccuracy: 1.0,
      biasDirection: 'balanced',
    };
  }

  // Calculate accuracy ratio for each adoption (estimated / actual)
  const accuracyRatios = adoptions.map(a => a.estimatedDays / a.actualDays);

  // Average accuracy
  const avgAccuracy = accuracyRatios.reduce((sum, r) => sum + r, 0) / accuracyRatios.length;

  // Determine bias direction
  let biasDirection: CostCalibration['biasDirection'];

  if (avgAccuracy < 0.85) {
    biasDirection = 'underestimate';
  } else if (avgAccuracy > 1.15) {
    biasDirection = 'overestimate';
  } else {
    biasDirection = 'balanced';
  }

  return {
    totalAdoptions: adoptions.length,
    avgEstimateAccuracy: Math.round(avgAccuracy * 100) / 100,
    biasDirection,
  };
}

/**
 * Get calibration data for a project.
 */
export async function getProjectCalibration(
  projectId: string
): Promise<CalibrationResult> {
  const entries = await getCostTrackingEntries(projectId);
  const adoptions = entries.map(entryToAdoptionRecord);
  const calibration = calculateCalibration(adoptions);

  return {
    projectId,
    calibration,
    adoptions,
    lastUpdated: entries.length > 0 ? entries[0].adoptedAt : new Date().toISOString(),
  };
}

/**
 * Get full cost tracking data for a project profile.
 */
export async function getCostTrackingForProfile(
  projectId: string
): Promise<CostTracking> {
  const result = await getProjectCalibration(projectId);

  return {
    adoptions: result.adoptions,
    calibration: result.calibration,
  };
}

// ============================================================
// ACCURACY ANALYSIS
// ============================================================

/**
 * Generate an accuracy report for a project.
 */
export async function generateAccuracyReport(
  projectId: string
): Promise<AccuracyReport> {
  const entries = await getCostTrackingEntries(projectId);
  const adoptions = entries.map(entryToAdoptionRecord);
  const calibration = calculateCalibration(adoptions);

  // Find outliers (estimates off by more than 100%)
  const outliers = adoptions.filter(a => {
    const ratio = a.estimatedDays / a.actualDays;
    return ratio < 0.5 || ratio > 2.0;
  });

  // Calculate accuracy by complexity (based on estimated days as proxy)
  const byComplexity: Record<string, number[]> = {
    trivial: [],    // < 1 day
    low: [],        // 1-3 days
    medium: [],     // 3-7 days
    high: [],       // 7-14 days
    very_high: [],  // > 14 days
  };

  for (const adoption of adoptions) {
    const ratio = adoption.estimatedDays / adoption.actualDays;
    const estimatedDays = adoption.estimatedDays;

    if (estimatedDays < 1) {
      byComplexity.trivial.push(ratio);
    } else if (estimatedDays <= 3) {
      byComplexity.low.push(ratio);
    } else if (estimatedDays <= 7) {
      byComplexity.medium.push(ratio);
    } else if (estimatedDays <= 14) {
      byComplexity.high.push(ratio);
    } else {
      byComplexity.very_high.push(ratio);
    }
  }

  const accuracyByComplexity: Record<string, number> = {};
  for (const [complexity, ratios] of Object.entries(byComplexity)) {
    if (ratios.length > 0) {
      const avg = ratios.reduce((sum, r) => sum + r, 0) / ratios.length;
      accuracyByComplexity[complexity] = Math.round(avg * 100) / 100;
    }
  }

  // Calculate recent trend (compare last 5 to previous 5)
  let recentTrend: AccuracyReport['recentTrend'] = 'stable';

  if (adoptions.length >= 10) {
    const recent5 = adoptions.slice(0, 5);
    const previous5 = adoptions.slice(5, 10);

    const recentAvg = recent5.reduce((sum, a) => sum + a.estimatedDays / a.actualDays, 0) / 5;
    const previousAvg = previous5.reduce((sum, a) => sum + a.estimatedDays / a.actualDays, 0) / 5;

    // Closer to 1.0 is better
    const recentError = Math.abs(recentAvg - 1.0);
    const previousError = Math.abs(previousAvg - 1.0);

    if (recentError < previousError - 0.1) {
      recentTrend = 'improving';
    } else if (recentError > previousError + 0.1) {
      recentTrend = 'worsening';
    }
  }

  return {
    projectId,
    totalAdoptions: calibration.totalAdoptions,
    avgEstimateAccuracy: calibration.avgEstimateAccuracy,
    biasDirection: calibration.biasDirection,
    accuracyByComplexity,
    recentTrend,
    outliers,
  };
}

/**
 * Get calibration multiplier for effort estimates.
 * Returns a factor to multiply estimates by based on historical accuracy.
 */
export function getCalibrationMultiplier(calibration: CostCalibration): number {
  if (calibration.totalAdoptions < 3) {
    // Not enough data, no adjustment
    return 1.0;
  }

  // If we tend to underestimate (accuracy < 1), increase estimates
  // If we tend to overestimate (accuracy > 1), decrease estimates
  const multiplier = 1 / calibration.avgEstimateAccuracy;

  // Cap the adjustment to avoid extreme values
  return Math.min(Math.max(multiplier, 0.5), 2.0);
}

/**
 * Apply calibration to an effort estimate.
 */
export function calibrateEstimate(
  estimatedDays: number,
  calibration: CostCalibration
): { calibratedDays: number; multiplier: number; note: string } {
  const multiplier = getCalibrationMultiplier(calibration);
  const calibratedDays = Math.round(estimatedDays * multiplier * 10) / 10;

  let note: string;

  if (multiplier === 1.0) {
    note = 'No calibration applied (insufficient data or balanced estimates)';
  } else if (multiplier > 1.0) {
    note = `Adjusted up by ${((multiplier - 1) * 100).toFixed(0)}% based on historical underestimation`;
  } else {
    note = `Adjusted down by ${((1 - multiplier) * 100).toFixed(0)}% based on historical overestimation`;
  }

  return { calibratedDays, multiplier, note };
}

// ============================================================
// MAINTENANCE
// ============================================================

/**
 * Delete old cost tracking entries (for data retention).
 */
export async function pruneOldEntries(
  projectId: string,
  keepCount: number = 100
): Promise<number> {
  // Get IDs of entries to keep
  const { data: toKeep, error: keepError } = await supabase
    .from('cost_tracking')
    .select('id')
    .eq('project_id', projectId)
    .order('adopted_at', { ascending: false })
    .limit(keepCount);

  if (keepError) {
    throw new Error(`Failed to get entries to keep: ${keepError.message}`);
  }

  if (!toKeep || toKeep.length < keepCount) {
    return 0; // Nothing to prune
  }

  const keepIds = toKeep.map(e => e.id);

  // Delete entries not in the keep list
  const { error: deleteError, count } = await supabase
    .from('cost_tracking')
    .delete({ count: 'exact' })
    .eq('project_id', projectId)
    .not('id', 'in', `(${keepIds.join(',')})`);

  if (deleteError) {
    throw new Error(`Failed to prune entries: ${deleteError.message}`);
  }

  logger.info('Pruned old cost tracking entries', {
    projectId,
    prunedCount: count,
    keptCount: keepCount,
  });

  return count || 0;
}
