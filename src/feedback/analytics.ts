/**
 * TechScout — Feedback Analytics (Layer 5)
 *
 * Aggregates and analyzes feedback data.
 * Provides insights for improving recommendations.
 * Tracks recommendation quality over time.
 */

import { logger } from '../lib/logger';
import { supabase } from '../db/client';
import type {
  FeedbackStatus,
  RecommendationFeedback,
  RecommendationAction,
  RecommendationPriority,
} from '../types';

// ============================================================
// TYPES
// ============================================================

export interface FeedbackMetrics {
  total: number;
  byStatus: Record<FeedbackStatus, number>;
  usefulRate: number;
  adoptionRate: number;
  dismissalRate: number;
  avgTimeToFeedback: number | null; // in hours
}

export interface ProjectFeedbackAnalytics {
  projectId: string;
  projectName: string;
  metrics: FeedbackMetrics;
  byAction: Record<RecommendationAction, FeedbackMetrics>;
  byPriority: Record<RecommendationPriority, FeedbackMetrics>;
  trends: FeedbackTrends;
  qualityScore: number;
  recommendations: AnalyticsRecommendation[];
}

export interface FeedbackTrends {
  period: 'week' | 'month' | 'quarter';
  usefulRateTrend: 'improving' | 'stable' | 'declining';
  adoptionRateTrend: 'improving' | 'stable' | 'declining';
  volumeTrend: 'increasing' | 'stable' | 'decreasing';
  periodComparison: {
    currentPeriod: FeedbackMetrics;
    previousPeriod: FeedbackMetrics;
  };
}

export interface AnalyticsRecommendation {
  type: 'insight' | 'warning' | 'suggestion';
  message: string;
  priority: 'high' | 'medium' | 'low';
  actionable: boolean;
}

export interface FeedbackDistribution {
  projectId: string;
  total: number;
  pending: number;
  useful: number;
  notRelevant: number;
  alreadyKnew: number;
  adopted: number;
  dismissed: number;
}

export interface TopDismissedPatterns {
  byCategory: Record<string, number>;
  byAction: Record<string, number>;
  commonReasons: Array<{ reason: string; count: number }>;
}

// ============================================================
// METRICS CALCULATION
// ============================================================

/**
 * Calculate feedback metrics from raw data.
 */
export function calculateMetrics(
  feedbackData: Array<{
    status: FeedbackStatus;
    submittedAt?: string;
    createdAt: string;
  }>
): FeedbackMetrics {
  const total = feedbackData.length;

  if (total === 0) {
    return {
      total: 0,
      byStatus: {
        pending: 0,
        useful: 0,
        not_relevant: 0,
        already_knew: 0,
        adopted: 0,
        dismissed: 0,
      },
      usefulRate: 0,
      adoptionRate: 0,
      dismissalRate: 0,
      avgTimeToFeedback: null,
    };
  }

  // Count by status
  const byStatus: Record<FeedbackStatus, number> = {
    pending: 0,
    useful: 0,
    not_relevant: 0,
    already_knew: 0,
    adopted: 0,
    dismissed: 0,
  };

  for (const fb of feedbackData) {
    byStatus[fb.status]++;
  }

  // Calculate rates (excluding pending from denominator)
  const responded = total - byStatus.pending;
  const positiveCount = byStatus.useful + byStatus.adopted + byStatus.already_knew;

  const usefulRate = responded > 0 ? positiveCount / responded : 0;
  const adoptionRate = responded > 0 ? byStatus.adopted / responded : 0;
  const dismissalRate = responded > 0 ? (byStatus.not_relevant + byStatus.dismissed) / responded : 0;

  // Calculate average time to feedback
  let totalTimeHours = 0;
  let timeCount = 0;

  for (const fb of feedbackData) {
    if (fb.submittedAt && fb.status !== 'pending') {
      const created = new Date(fb.createdAt).getTime();
      const submitted = new Date(fb.submittedAt).getTime();
      const hours = (submitted - created) / (1000 * 60 * 60);
      totalTimeHours += hours;
      timeCount++;
    }
  }

  const avgTimeToFeedback = timeCount > 0 ? totalTimeHours / timeCount : null;

  return {
    total,
    byStatus,
    usefulRate: Math.round(usefulRate * 1000) / 1000,
    adoptionRate: Math.round(adoptionRate * 1000) / 1000,
    dismissalRate: Math.round(dismissalRate * 1000) / 1000,
    avgTimeToFeedback: avgTimeToFeedback ? Math.round(avgTimeToFeedback * 10) / 10 : null,
  };
}

/**
 * Calculate a quality score based on metrics (0-100).
 */
export function calculateQualityScore(metrics: FeedbackMetrics): number {
  if (metrics.total === 0) {
    return 50; // Neutral score for no data
  }

  // Weight factors
  const usefulWeight = 0.4;
  const adoptionWeight = 0.4;
  const dismissalPenalty = 0.2;

  // Calculate base score
  const usefulScore = metrics.usefulRate * 100 * usefulWeight;
  const adoptionScore = metrics.adoptionRate * 100 * adoptionWeight;
  const dismissalDeduction = metrics.dismissalRate * 100 * dismissalPenalty;

  const score = usefulScore + adoptionScore - dismissalDeduction;

  // Clamp to 0-100
  return Math.min(Math.max(Math.round(score), 0), 100);
}

// ============================================================
// PROJECT ANALYTICS
// ============================================================

/**
 * Get feedback distribution for a project.
 */
export async function getFeedbackDistribution(
  projectId: string
): Promise<FeedbackDistribution> {
  const { data, error } = await supabase
    .from('recommendation_feedback')
    .select(`
      status,
      recommendations!inner(project_id)
    `)
    .eq('recommendations.project_id', projectId);

  if (error) {
    throw new Error(`Failed to get feedback distribution: ${error.message}`);
  }

  const distribution: FeedbackDistribution = {
    projectId,
    total: data.length,
    pending: 0,
    useful: 0,
    notRelevant: 0,
    alreadyKnew: 0,
    adopted: 0,
    dismissed: 0,
  };

  for (const row of data) {
    switch (row.status) {
      case 'pending':
        distribution.pending++;
        break;
      case 'useful':
        distribution.useful++;
        break;
      case 'not_relevant':
        distribution.notRelevant++;
        break;
      case 'already_knew':
        distribution.alreadyKnew++;
        break;
      case 'adopted':
        distribution.adopted++;
        break;
      case 'dismissed':
        distribution.dismissed++;
        break;
    }
  }

  return distribution;
}

/**
 * Get comprehensive feedback analytics for a project.
 */
export async function getProjectAnalytics(
  projectId: string,
  projectName: string
): Promise<ProjectFeedbackAnalytics> {
  logger.info('Generating project feedback analytics', { projectId });

  // Get all feedback with recommendation details
  const { data, error } = await supabase
    .from('recommendation_feedback')
    .select(`
      *,
      recommendations!inner(
        project_id,
        action,
        priority,
        created_at
      )
    `)
    .eq('recommendations.project_id', projectId);

  if (error) {
    throw new Error(`Failed to get feedback data: ${error.message}`);
  }

  // Prepare data for metrics calculation
  const feedbackData = data.map(row => ({
    status: row.status as FeedbackStatus,
    submittedAt: row.submitted_at,
    createdAt: row.created_at,
    action: row.recommendations.action as RecommendationAction,
    priority: row.recommendations.priority as RecommendationPriority,
  }));

  // Calculate overall metrics
  const metrics = calculateMetrics(feedbackData);

  // Calculate metrics by action
  const byAction: Partial<Record<RecommendationAction, FeedbackMetrics>> = {};
  const actions: RecommendationAction[] = [
    'REPLACE_EXISTING',
    'COMPLEMENT',
    'NEW_CAPABILITY',
    'MONITOR',
  ];

  for (const action of actions) {
    const actionData = feedbackData.filter(fb => fb.action === action);
    if (actionData.length > 0) {
      byAction[action] = calculateMetrics(actionData);
    }
  }

  // Calculate metrics by priority
  const byPriority: Partial<Record<RecommendationPriority, FeedbackMetrics>> = {};
  const priorities: RecommendationPriority[] = ['critical', 'high', 'medium', 'low', 'info'];

  for (const priority of priorities) {
    const priorityData = feedbackData.filter(fb => fb.priority === priority);
    if (priorityData.length > 0) {
      byPriority[priority] = calculateMetrics(priorityData);
    }
  }

  // Calculate trends (simplified - would need historical data in production)
  const trends: FeedbackTrends = {
    period: 'month',
    usefulRateTrend: 'stable',
    adoptionRateTrend: 'stable',
    volumeTrend: 'stable',
    periodComparison: {
      currentPeriod: metrics,
      previousPeriod: metrics, // Same as current when no historical data
    },
  };

  // Calculate quality score
  const qualityScore = calculateQualityScore(metrics);

  // Generate actionable recommendations
  const recommendations = generateRecommendations(metrics, byAction, byPriority);

  return {
    projectId,
    projectName,
    metrics,
    byAction: byAction as Record<RecommendationAction, FeedbackMetrics>,
    byPriority: byPriority as Record<RecommendationPriority, FeedbackMetrics>,
    trends,
    qualityScore,
    recommendations,
  };
}

/**
 * Generate actionable recommendations based on analytics.
 */
function generateRecommendations(
  metrics: FeedbackMetrics,
  byAction: Partial<Record<RecommendationAction, FeedbackMetrics>>,
  byPriority: Partial<Record<RecommendationPriority, FeedbackMetrics>>
): AnalyticsRecommendation[] {
  const recommendations: AnalyticsRecommendation[] = [];

  // Check overall dismissal rate
  if (metrics.dismissalRate > 0.3) {
    recommendations.push({
      type: 'warning',
      message: `High dismissal rate (${(metrics.dismissalRate * 100).toFixed(1)}%). Consider tightening pre-filter or maturity gate criteria.`,
      priority: 'high',
      actionable: true,
    });
  }

  // Check adoption rate
  if (metrics.adoptionRate > 0.2) {
    recommendations.push({
      type: 'insight',
      message: `Strong adoption rate (${(metrics.adoptionRate * 100).toFixed(1)}%). Recommendations are providing actionable value.`,
      priority: 'low',
      actionable: false,
    });
  } else if (metrics.adoptionRate < 0.05 && metrics.total > 10) {
    recommendations.push({
      type: 'suggestion',
      message: 'Low adoption rate. Consider focusing on higher-priority recommendations or improving implementation guidance.',
      priority: 'medium',
      actionable: true,
    });
  }

  // Check REPLACE_EXISTING performance
  const replaceMetrics = byAction.REPLACE_EXISTING;
  if (replaceMetrics && replaceMetrics.dismissalRate > 0.4) {
    recommendations.push({
      type: 'warning',
      message: 'REPLACE_EXISTING recommendations have high dismissal rate. These may be too disruptive or insufficiently justified.',
      priority: 'high',
      actionable: true,
    });
  }

  // Check critical priority performance
  const criticalMetrics = byPriority.critical;
  if (criticalMetrics && criticalMetrics.usefulRate < 0.5) {
    recommendations.push({
      type: 'warning',
      message: 'Critical priority recommendations have low usefulness. Review criteria for marking items as critical.',
      priority: 'high',
      actionable: true,
    });
  }

  // Check pending feedback rate
  const pendingRate = metrics.total > 0 ? metrics.byStatus.pending / metrics.total : 0;
  if (pendingRate > 0.5) {
    recommendations.push({
      type: 'suggestion',
      message: `${(pendingRate * 100).toFixed(0)}% of recommendations are pending feedback. Consider adding feedback reminders.`,
      priority: 'medium',
      actionable: true,
    });
  }

  // Check already_knew rate
  const alreadyKnewRate = metrics.total > 0 ? metrics.byStatus.already_knew / metrics.total : 0;
  if (alreadyKnewRate > 0.2) {
    recommendations.push({
      type: 'suggestion',
      message: 'Many recommendations cover already-known technologies. Consider strengthening novelty filters.',
      priority: 'medium',
      actionable: true,
    });
  }

  return recommendations;
}

// ============================================================
// DISMISSAL ANALYSIS
// ============================================================

/**
 * Analyze patterns in dismissed recommendations.
 */
export async function analyzeDismissalPatterns(
  projectId: string
): Promise<TopDismissedPatterns> {
  const { data, error } = await supabase
    .from('recommendation_feedback')
    .select(`
      user_notes,
      recommendations!inner(
        project_id,
        action,
        type
      )
    `)
    .eq('recommendations.project_id', projectId)
    .in('status', ['dismissed', 'not_relevant']);

  if (error) {
    throw new Error(`Failed to analyze dismissal patterns: ${error.message}`);
  }

  // Count by action
  const byAction: Record<string, number> = {};
  for (const row of data) {
    const rec = row.recommendations as unknown as { action: string; type: string };
    const action = rec.action;
    byAction[action] = (byAction[action] || 0) + 1;
  }

  // Count by category (type)
  const byCategory: Record<string, number> = {};
  for (const row of data) {
    const rec = row.recommendations as unknown as { action: string; type: string };
    const category = rec.type;
    byCategory[category] = (byCategory[category] || 0) + 1;
  }

  // Extract common reasons from user notes
  const reasonCounts: Record<string, number> = {};
  const keywords = [
    'too risky',
    'already using',
    'not compatible',
    'too expensive',
    'not ready',
    'too complex',
    'not needed',
    'wrong timing',
    'outdated',
    'no resources',
  ];

  for (const row of data) {
    const notes = row.user_notes?.toLowerCase() || '';
    for (const keyword of keywords) {
      if (notes.includes(keyword)) {
        reasonCounts[keyword] = (reasonCounts[keyword] || 0) + 1;
      }
    }
  }

  const commonReasons = Object.entries(reasonCounts)
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return {
    byCategory,
    byAction,
    commonReasons,
  };
}

// ============================================================
// AGGREGATE ANALYTICS
// ============================================================

/**
 * Get aggregate feedback analytics across all projects.
 * Useful for system-wide quality monitoring.
 */
export async function getAggregateAnalytics(): Promise<{
  totalProjects: number;
  totalRecommendations: number;
  totalFeedback: number;
  globalMetrics: FeedbackMetrics;
  topPerformingProjects: Array<{ projectId: string; qualityScore: number }>;
}> {
  // Get all feedback data
  const { data: feedbackData, error: fbError } = await supabase
    .from('recommendation_feedback')
    .select('status, submitted_at, created_at');

  if (fbError) {
    throw new Error(`Failed to get aggregate feedback: ${fbError.message}`);
  }

  // Get project counts
  const { count: projectCount, error: projError } = await supabase
    .from('projects')
    .select('*', { count: 'exact', head: true });

  if (projError) {
    throw new Error(`Failed to count projects: ${projError.message}`);
  }

  // Get recommendation counts
  const { count: recCount, error: recError } = await supabase
    .from('recommendations')
    .select('*', { count: 'exact', head: true });

  if (recError) {
    throw new Error(`Failed to count recommendations: ${recError.message}`);
  }

  // Calculate global metrics
  const globalMetrics = calculateMetrics(
    feedbackData.map(fb => ({
      status: fb.status as FeedbackStatus,
      submittedAt: fb.submitted_at,
      createdAt: fb.created_at,
    }))
  );

  return {
    totalProjects: projectCount || 0,
    totalRecommendations: recCount || 0,
    totalFeedback: feedbackData.length,
    globalMetrics,
    topPerformingProjects: [], // Would need per-project calculation
  };
}

// ============================================================
// TIME-BASED ANALYTICS
// ============================================================

/**
 * Get feedback metrics for a specific time period.
 */
export async function getMetricsForPeriod(
  projectId: string,
  startDate: Date,
  endDate: Date
): Promise<FeedbackMetrics> {
  const { data, error } = await supabase
    .from('recommendation_feedback')
    .select(`
      status,
      submitted_at,
      created_at,
      recommendations!inner(project_id)
    `)
    .eq('recommendations.project_id', projectId)
    .gte('created_at', startDate.toISOString())
    .lte('created_at', endDate.toISOString());

  if (error) {
    throw new Error(`Failed to get period metrics: ${error.message}`);
  }

  return calculateMetrics(
    data.map(row => ({
      status: row.status as FeedbackStatus,
      submittedAt: row.submitted_at,
      createdAt: row.created_at,
    }))
  );
}

/**
 * Get weekly metrics for trend analysis.
 */
export async function getWeeklyTrends(
  projectId: string,
  weeksBack: number = 12
): Promise<Array<{ week: string; metrics: FeedbackMetrics }>> {
  const trends: Array<{ week: string; metrics: FeedbackMetrics }> = [];

  const now = new Date();

  for (let i = 0; i < weeksBack; i++) {
    const endDate = new Date(now);
    endDate.setDate(endDate.getDate() - i * 7);

    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - 7);

    const metrics = await getMetricsForPeriod(projectId, startDate, endDate);

    trends.push({
      week: startDate.toISOString().split('T')[0],
      metrics,
    });
  }

  return trends.reverse();
}
