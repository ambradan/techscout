/**
 * TechScout — Feedback Orchestrator (Layer 5)
 *
 * Coordinates feedback collection, cost tracking, and analytics.
 * Provides a unified interface for the feedback system.
 */

import { logger } from '../lib/logger';
import { supabase } from '../db/client';
import type {
  FeedbackStatus,
  RecommendationFeedback,
  CostTrackingFeedback,
  CostTracking,
  CostCalibration,
  Recommendation,
} from '../types';

import {
  submitFeedback,
  submitAdoption,
  updateFeedback,
  getFeedback,
  getFeedbackById,
  listFeedback,
  getAdoptedRecommendations,
  getPendingFeedback,
  bulkMarkNotRelevant,
  bulkDismiss,
  markUseful,
  markNotRelevant,
  markAlreadyKnew,
  dismissRecommendation,
  SubmitFeedbackInput,
  SubmitAdoptionInput,
  UpdateFeedbackInput,
  FeedbackResult,
  FeedbackListOptions,
} from './feedback';

import {
  recordAdoptionCost,
  recordFromFeedback,
  getCostTrackingEntries,
  getCostForRecommendation,
  getProjectCalibration,
  getCostTrackingForProfile,
  calculateCalibration,
  getCalibrationMultiplier,
  calibrateEstimate,
  generateAccuracyReport,
  pruneOldEntries,
  RecordAdoptionCostInput,
  CostTrackingEntry,
  CalibrationResult,
  AccuracyReport,
} from './cost-tracker';

import {
  calculateMetrics,
  calculateQualityScore,
  getFeedbackDistribution,
  getProjectAnalytics,
  analyzeDismissalPatterns,
  getAggregateAnalytics,
  getMetricsForPeriod,
  getWeeklyTrends,
  FeedbackMetrics,
  ProjectFeedbackAnalytics,
  FeedbackDistribution,
  TopDismissedPatterns,
} from './analytics';

// ============================================================
// TYPES
// ============================================================

export interface FeedbackSubmission {
  recommendationId: string;
  status: FeedbackStatus;
  userId: string;
  notes?: string;
  costTracking?: CostTrackingFeedback;
  adoptionOutcome?: Record<string, unknown>;
}

export interface FeedbackSummary {
  projectId: string;
  distribution: FeedbackDistribution;
  metrics: FeedbackMetrics;
  qualityScore: number;
  calibration: CostCalibration;
  pendingCount: number;
}

export interface FeedbackLoopResult {
  success: boolean;
  feedback?: RecommendationFeedback;
  costRecorded: boolean;
  calibrationUpdated: boolean;
  error?: string;
}

// ============================================================
// UNIFIED FEEDBACK SUBMISSION
// ============================================================

/**
 * Submit feedback with automatic cost tracking and calibration update.
 */
export async function submitFeedbackWithTracking(
  submission: FeedbackSubmission,
  recommendation?: Recommendation
): Promise<FeedbackLoopResult> {
  logger.info('Processing feedback submission', {
    recommendationId: submission.recommendationId,
    status: submission.status,
    hasCostData: !!submission.costTracking?.actualDays,
  });

  try {
    let feedback: RecommendationFeedback | undefined;
    let costRecorded = false;

    // Handle adoption with cost tracking
    if (submission.status === 'adopted') {
      const result = await submitAdoption({
        recommendationId: submission.recommendationId,
        submittedBy: submission.userId,
        userNotes: submission.notes,
        costTracking: submission.costTracking,
        adoptionOutcome: submission.adoptionOutcome,
      });

      if (!result.success) {
        return {
          success: false,
          costRecorded: false,
          calibrationUpdated: false,
          error: result.error,
        };
      }

      feedback = result.feedback;

      // Record cost tracking if we have actual days and recommendation data
      if (
        submission.costTracking?.actualDays &&
        recommendation
      ) {
        try {
          // Parse rawEstimateDays from string (e.g., "5 days" or "5")
          const rawEstimate = recommendation.technical.effort.rawEstimateDays;
          const estimatedDays = parseFloat(rawEstimate.replace(/[^\d.]/g, '')) || 0;

          await recordFromFeedback(
            recommendation.projectId,
            recommendation.id,
            recommendation.subject.name,
            estimatedDays,
            submission.costTracking,
            feedback?.adoptedAt || new Date().toISOString()
          );
          costRecorded = true;
        } catch (err) {
          logger.warn('Cost tracking record failed', {
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    } else {
      // Regular feedback submission
      const result = await submitFeedback({
        recommendationId: submission.recommendationId,
        status: submission.status,
        submittedBy: submission.userId,
        userNotes: submission.notes,
      });

      if (!result.success) {
        return {
          success: false,
          costRecorded: false,
          calibrationUpdated: false,
          error: result.error,
        };
      }

      feedback = result.feedback;
    }

    return {
      success: true,
      feedback,
      costRecorded,
      calibrationUpdated: costRecorded, // Calibration auto-updates when cost is recorded
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('Feedback submission failed', { error: errorMsg });

    return {
      success: false,
      costRecorded: false,
      calibrationUpdated: false,
      error: errorMsg,
    };
  }
}

// ============================================================
// FEEDBACK SUMMARY
// ============================================================

/**
 * Get a comprehensive feedback summary for a project.
 */
export async function getProjectFeedbackSummary(
  projectId: string
): Promise<FeedbackSummary> {
  logger.info('Getting project feedback summary', { projectId });

  // Get distribution
  const distribution = await getFeedbackDistribution(projectId);

  // Calculate metrics from distribution
  const metrics = calculateMetrics([
    ...Array(distribution.pending).fill({ status: 'pending', createdAt: new Date().toISOString() }),
    ...Array(distribution.useful).fill({ status: 'useful', createdAt: new Date().toISOString(), submittedAt: new Date().toISOString() }),
    ...Array(distribution.notRelevant).fill({ status: 'not_relevant', createdAt: new Date().toISOString(), submittedAt: new Date().toISOString() }),
    ...Array(distribution.alreadyKnew).fill({ status: 'already_knew', createdAt: new Date().toISOString(), submittedAt: new Date().toISOString() }),
    ...Array(distribution.adopted).fill({ status: 'adopted', createdAt: new Date().toISOString(), submittedAt: new Date().toISOString() }),
    ...Array(distribution.dismissed).fill({ status: 'dismissed', createdAt: new Date().toISOString(), submittedAt: new Date().toISOString() }),
  ]);

  // Get calibration data
  const calibrationResult = await getProjectCalibration(projectId);

  // Calculate quality score
  const qualityScore = calculateQualityScore(metrics);

  return {
    projectId,
    distribution,
    metrics,
    qualityScore,
    calibration: calibrationResult.calibration,
    pendingCount: distribution.pending,
  };
}

// ============================================================
// FEEDBACK LOOP INTEGRATION
// ============================================================

/**
 * Get calibrated effort estimate for a new recommendation.
 */
export async function getCalibratedEffortEstimate(
  projectId: string,
  rawEstimateDays: number
): Promise<{ calibratedDays: number; multiplier: number; note: string }> {
  const calibrationResult = await getProjectCalibration(projectId);
  return calibrateEstimate(rawEstimateDays, calibrationResult.calibration);
}

/**
 * Check if feedback is needed for recent recommendations.
 */
export async function checkFeedbackNeeded(
  projectId: string,
  daysOld: number = 7
): Promise<{
  needsFeedback: number;
  recommendations: Array<{ id: string; subject: string; daysOld: number }>;
}> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysOld);

  const { data, error } = await supabase
    .from('recommendations')
    .select(`
      id,
      subject,
      created_at,
      recommendation_feedback(status)
    `)
    .eq('project_id', projectId)
    .gte('created_at', cutoffDate.toISOString())
    .is('recommendation_feedback.id', null);

  if (error) {
    throw new Error(`Failed to check feedback needed: ${error.message}`);
  }

  const recommendations = data.map(rec => ({
    id: rec.id,
    subject: (rec.subject as { name: string }).name,
    daysOld: Math.floor(
      (Date.now() - new Date(rec.created_at).getTime()) / (1000 * 60 * 60 * 24)
    ),
  }));

  return {
    needsFeedback: recommendations.length,
    recommendations,
  };
}

// ============================================================
// FEEDBACK REMINDERS
// ============================================================

/**
 * Get recommendations that need feedback reminders.
 */
export async function getFeedbackReminders(
  projectId: string,
  options?: {
    minDaysOld?: number;
    maxDaysOld?: number;
    limit?: number;
  }
): Promise<Array<{
  recommendationId: string;
  subject: string;
  priority: string;
  daysOld: number;
  reminderLevel: 'gentle' | 'normal' | 'urgent';
}>> {
  const minDays = options?.minDaysOld || 3;
  const maxDays = options?.maxDaysOld || 30;
  const limit = options?.limit || 10;

  const minDate = new Date();
  minDate.setDate(minDate.getDate() - maxDays);

  const maxDate = new Date();
  maxDate.setDate(maxDate.getDate() - minDays);

  const { data, error } = await supabase
    .from('recommendations')
    .select(`
      id,
      subject,
      priority,
      created_at,
      recommendation_feedback(status)
    `)
    .eq('project_id', projectId)
    .gte('created_at', minDate.toISOString())
    .lte('created_at', maxDate.toISOString())
    .order('priority', { ascending: true })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to get feedback reminders: ${error.message}`);
  }

  // Filter to only pending feedback
  const pending = data.filter(
    rec => !rec.recommendation_feedback || rec.recommendation_feedback.length === 0 ||
    rec.recommendation_feedback.every(fb => fb.status === 'pending')
  );

  return pending.map(rec => {
    const daysOld = Math.floor(
      (Date.now() - new Date(rec.created_at).getTime()) / (1000 * 60 * 60 * 24)
    );

    let reminderLevel: 'gentle' | 'normal' | 'urgent';
    if (daysOld >= 14) {
      reminderLevel = 'urgent';
    } else if (daysOld >= 7) {
      reminderLevel = 'normal';
    } else {
      reminderLevel = 'gentle';
    }

    return {
      recommendationId: rec.id,
      subject: (rec.subject as { name: string }).name,
      priority: rec.priority,
      daysOld,
      reminderLevel,
    };
  });
}

// ============================================================
// QUALITY IMPROVEMENT
// ============================================================

/**
 * Get suggestions for improving recommendation quality based on feedback.
 */
export async function getQualityImprovementSuggestions(
  projectId: string
): Promise<{
  suggestions: Array<{
    area: string;
    issue: string;
    suggestion: string;
    impact: 'high' | 'medium' | 'low';
  }>;
  currentScore: number;
  potentialScore: number;
}> {
  const analytics = await getProjectAnalytics(projectId, 'Project');

  const suggestions: Array<{
    area: string;
    issue: string;
    suggestion: string;
    impact: 'high' | 'medium' | 'low';
  }> = [];

  // Convert analytics recommendations to improvement suggestions
  for (const rec of analytics.recommendations) {
    if (rec.actionable) {
      let area = 'General';
      if (rec.message.includes('dismissal')) area = 'Relevance Filtering';
      if (rec.message.includes('adoption')) area = 'Actionability';
      if (rec.message.includes('priority')) area = 'Prioritization';
      if (rec.message.includes('pending')) area = 'User Engagement';

      suggestions.push({
        area,
        issue: rec.message,
        suggestion: getSuggestionForIssue(rec.message),
        impact: rec.priority,
      });
    }
  }

  // Estimate potential score improvement
  const potentialScore = Math.min(
    analytics.qualityScore + suggestions.filter(s => s.impact === 'high').length * 10,
    100
  );

  return {
    suggestions,
    currentScore: analytics.qualityScore,
    potentialScore,
  };
}

function getSuggestionForIssue(issue: string): string {
  if (issue.includes('dismissal rate')) {
    return 'Tighten pre-filter criteria to reduce noise. Consider adding stack-specific relevance checks.';
  }
  if (issue.includes('adoption rate')) {
    return 'Improve implementation guidance in briefs. Add step-by-step migration paths.';
  }
  if (issue.includes('REPLACE_EXISTING')) {
    return 'Only recommend replacements when cost-of-no-change clearly exceeds cost-of-change. Add risk mitigation steps.';
  }
  if (issue.includes('critical priority')) {
    return 'Review critical priority criteria. Reserve for genuine security issues or breaking changes.';
  }
  if (issue.includes('pending feedback')) {
    return 'Implement feedback reminders. Consider in-app prompts after recommendations are viewed.';
  }
  if (issue.includes('already-known')) {
    return 'Add novelty detection to filter out technologies already in the project stack.';
  }
  return 'Review matching criteria and adjust thresholds based on feedback patterns.';
}

// ============================================================
// RE-EXPORTS
// ============================================================

// Feedback collection
export {
  submitFeedback,
  submitAdoption,
  updateFeedback,
  getFeedback,
  getFeedbackById,
  listFeedback,
  getAdoptedRecommendations,
  getPendingFeedback,
  bulkMarkNotRelevant,
  bulkDismiss,
  markUseful,
  markNotRelevant,
  markAlreadyKnew,
  dismissRecommendation,
  SubmitFeedbackInput,
  SubmitAdoptionInput,
  UpdateFeedbackInput,
  FeedbackResult,
  FeedbackListOptions,
} from './feedback';

// Cost tracking
export {
  recordAdoptionCost,
  recordFromFeedback,
  getCostTrackingEntries,
  getCostForRecommendation,
  getProjectCalibration,
  getCostTrackingForProfile,
  calculateCalibration,
  getCalibrationMultiplier,
  calibrateEstimate,
  generateAccuracyReport,
  pruneOldEntries,
  RecordAdoptionCostInput,
  CostTrackingEntry,
  CalibrationResult,
  AccuracyReport,
} from './cost-tracker';

// Analytics
export {
  calculateMetrics,
  calculateQualityScore,
  getFeedbackDistribution,
  getProjectAnalytics,
  analyzeDismissalPatterns,
  getAggregateAnalytics,
  getMetricsForPeriod,
  getWeeklyTrends,
  FeedbackMetrics,
  ProjectFeedbackAnalytics,
  FeedbackDistribution,
  TopDismissedPatterns,
} from './analytics';
