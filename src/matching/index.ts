/**
 * TechScout — Matching Engine (Layer 3)
 *
 * Orchestrates the complete matching pipeline:
 * 1. Pre-filter (deterministic, zero LLM)
 * 2. Maturity Gate (technology readiness)
 * 3. LLM Analysis (Claude API)
 * 4. Stability Gate (cost of change vs cost of no-change)
 * 5. Ranker (final scoring, capping, role visibility)
 *
 * PRINCIPLE: Bias towards stability.
 * Only recommend changes when cost_of_no_change > cost_of_change.
 */

import type {
  FeedItem,
  ProjectProfile,
  Recommendation,
  RecommendationAction,
  PreFilterMatch,
} from '../types';
import { logger } from '../lib/logger';
import { generateTraceId } from '../lib/ifx';

// Re-export components
export * from './prefilter';
export * from './maturity';
export * from './analyzer';
export * from './stability-gate';
export * from './ranker';
export * from './breaking-change';

// Import components for orchestration
import { preFilterBatch, createConfigFromProfile, getPassedItems } from './prefilter';
import {
  evaluateMaturityGate,
  inferMaturityFromFeedItem,
  getRecommendedAction,
} from './maturity';
import { analyzeItem, type AnalyzerInput } from './analyzer';
import { evaluateStabilityGate, quickStabilityCheck } from './stability-gate';
import {
  buildRecommendation,
  rankAndCap,
  deduplicateBySubject,
  getRecommendationsSummary,
  type RankedRecommendation,
} from './ranker';

// ============================================================
// CONFIGURATION
// ============================================================

export interface MatchingConfig {
  /** Skip LLM analysis (for testing) */
  skipLLM?: boolean;
  /** Maximum items to analyze with LLM */
  maxLLMItems?: number;
  /** Enable debug logging */
  debug?: boolean;
  /** Use quick relevance check before full analysis */
  useQuickCheck?: boolean;
}

const DEFAULT_CONFIG: Required<MatchingConfig> = {
  skipLLM: false,
  maxLLMItems: 20,
  debug: false,
  useQuickCheck: true,
};

// ============================================================
// RESULT TYPES
// ============================================================

export interface MatchingResult {
  projectId: string;
  traceId: string;
  recommendations: Recommendation[];
  summary: {
    feedItemsEvaluated: number;
    passedPreFilter: number;
    passedMaturity: number;
    analyzed: number;
    recommended: number;
    delivered: number;
  };
  timing: {
    preFilterMs: number;
    maturityMs: number;
    analysisMs: number;
    stabilityMs: number;
    rankingMs: number;
    totalMs: number;
  };
  errors: string[];
}

// ============================================================
// PIPELINE STAGES
// ============================================================

interface PipelineContext {
  items: FeedItem[];
  profile: ProjectProfile;
  config: Required<MatchingConfig>;
  traceId: string;
  errors: string[];
  timing: Record<string, number>;
}

/**
 * Stage 1: Pre-filter items deterministically.
 */
async function stagePreFilter(
  ctx: PipelineContext
): Promise<{ matches: PreFilterMatch[]; passedItems: FeedItem[] }> {
  const start = Date.now();

  const filterConfig = createConfigFromProfile(ctx.profile);
  const result = preFilterBatch(ctx.items, ctx.profile, filterConfig);
  const passedItems = getPassedItems(ctx.items, result.matches);

  ctx.timing.preFilter = Date.now() - start;

  logger.info('Pre-filter stage completed', {
    traceId: ctx.traceId,
    evaluated: ctx.items.length,
    passed: passedItems.length,
    durationMs: ctx.timing.preFilter,
  });

  return {
    matches: result.matches.filter(m => m.passedFilter),
    passedItems,
  };
}

/**
 * Stage 2: Evaluate maturity gate for each item.
 */
async function stageMaturity(
  ctx: PipelineContext,
  items: FeedItem[],
  matches: PreFilterMatch[]
): Promise<{
  passed: Array<{
    item: FeedItem;
    match: PreFilterMatch;
    maturity: ReturnType<typeof evaluateMaturityGate>;
    action: RecommendationAction;
  }>;
}> {
  const start = Date.now();
  const passed: Array<{
    item: FeedItem;
    match: PreFilterMatch;
    maturity: ReturnType<typeof evaluateMaturityGate>;
    action: RecommendationAction;
  }> = [];

  for (const item of items) {
    const match = matches.find(m => m.feedItemId === item.id);
    if (!match) continue;

    const maturity = inferMaturityFromFeedItem(item);

    // Determine preferred action based on match
    let preferredAction: RecommendationAction = 'MONITOR';
    if (match.matchScore >= 0.6) {
      preferredAction = 'REPLACE_EXISTING';
    } else if (match.matchScore >= 0.4) {
      preferredAction = 'COMPLEMENT';
    } else if (match.matchScore >= 0.2) {
      preferredAction = 'NEW_CAPABILITY';
    }

    // Evaluate maturity gate
    const maturityResult = evaluateMaturityGate({
      maturity,
      action: preferredAction,
      traction: {
        githubStars: item.traction.githubStars,
        githubStars30dGrowth: item.traction.githubStars30dGrowth,
        npmWeeklyDownloads: item.traction.npmWeeklyDownloads,
      },
    });

    // Adjust action based on maturity
    const recommendedAction = getRecommendedAction(maturity, preferredAction);

    // Quick stability check
    const quickCheck = quickStabilityCheck(ctx.profile, maturityResult, match.matchScore);

    if (quickCheck.proceed) {
      passed.push({
        item,
        match,
        maturity: maturityResult,
        action: recommendedAction,
      });
    } else if (ctx.config.debug) {
      logger.debug('Item failed quick stability check', {
        itemId: item.id,
        reason: quickCheck.reason,
      });
    }
  }

  ctx.timing.maturity = Date.now() - start;

  logger.info('Maturity stage completed', {
    traceId: ctx.traceId,
    evaluated: items.length,
    passed: passed.length,
    durationMs: ctx.timing.maturity,
  });

  return { passed };
}

/**
 * Stage 3: LLM Analysis for passed items.
 */
async function stageAnalysis(
  ctx: PipelineContext,
  items: Array<{
    item: FeedItem;
    match: PreFilterMatch;
    maturity: ReturnType<typeof evaluateMaturityGate>;
    action: RecommendationAction;
  }>
): Promise<Array<{
  item: FeedItem;
  match: PreFilterMatch;
  maturity: ReturnType<typeof evaluateMaturityGate>;
  action: RecommendationAction;
  analysis: Awaited<ReturnType<typeof analyzeItem>>;
}>> {
  const start = Date.now();
  const results: Array<{
    item: FeedItem;
    match: PreFilterMatch;
    maturity: ReturnType<typeof evaluateMaturityGate>;
    action: RecommendationAction;
    analysis: Awaited<ReturnType<typeof analyzeItem>>;
  }> = [];

  // Limit LLM calls
  const toAnalyze = items.slice(0, ctx.config.maxLLMItems);

  if (ctx.config.skipLLM) {
    logger.info('Skipping LLM analysis (config)', { traceId: ctx.traceId });
    ctx.timing.analysis = Date.now() - start;
    return results;
  }

  for (const { item, match, maturity, action } of toAnalyze) {
    try {
      const input: AnalyzerInput = {
        item,
        profile: ctx.profile,
        preFilterMatch: match,
        maturityResult: maturity,
        proposedAction: action,
      };

      const analysis = await analyzeItem(input);

      results.push({
        item,
        match,
        maturity,
        action,
        analysis,
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      ctx.errors.push(`Analysis failed for ${item.id}: ${errorMsg}`);
      logger.warn('LLM analysis failed for item', {
        traceId: ctx.traceId,
        itemId: item.id,
        error: errorMsg,
      });
    }
  }

  ctx.timing.analysis = Date.now() - start;

  logger.info('Analysis stage completed', {
    traceId: ctx.traceId,
    attempted: toAnalyze.length,
    succeeded: results.length,
    durationMs: ctx.timing.analysis,
  });

  return results;
}

/**
 * Stage 4: Stability gate evaluation.
 */
async function stageStability(
  ctx: PipelineContext,
  items: Array<{
    item: FeedItem;
    match: PreFilterMatch;
    maturity: ReturnType<typeof evaluateMaturityGate>;
    action: RecommendationAction;
    analysis: Awaited<ReturnType<typeof analyzeItem>>;
  }>
): Promise<Array<{
  item: FeedItem;
  match: PreFilterMatch;
  maturity: ReturnType<typeof evaluateMaturityGate>;
  action: RecommendationAction;
  analysis: Awaited<ReturnType<typeof analyzeItem>>;
  stability: ReturnType<typeof evaluateStabilityGate>;
}>> {
  const start = Date.now();
  const results: Array<{
    item: FeedItem;
    match: PreFilterMatch;
    maturity: ReturnType<typeof evaluateMaturityGate>;
    action: RecommendationAction;
    analysis: Awaited<ReturnType<typeof analyzeItem>>;
    stability: ReturnType<typeof evaluateStabilityGate>;
  }> = [];

  for (const { item, match, maturity, action, analysis } of items) {
    const stability = evaluateStabilityGate({
      technical: analysis.technical,
      profile: ctx.profile,
      maturityResult: maturity,
      action,
      technologiesMatched: match.technologiesMatched,
      itemTitle: item.title,
      itemDescription: item.description,
    });

    results.push({
      item,
      match,
      maturity,
      action,
      analysis,
      stability,
    });
  }

  ctx.timing.stability = Date.now() - start;

  const recommended = results.filter(r => r.stability.verdict === 'RECOMMEND').length;

  logger.info('Stability stage completed', {
    traceId: ctx.traceId,
    evaluated: items.length,
    recommended,
    monitored: results.filter(r => r.stability.verdict === 'MONITOR').length,
    deferred: results.filter(r => r.stability.verdict === 'DEFER').length,
    durationMs: ctx.timing.stability,
  });

  return results;
}

/**
 * Stage 5: Ranking and capping.
 */
async function stageRanking(
  ctx: PipelineContext,
  items: Array<{
    item: FeedItem;
    match: PreFilterMatch;
    maturity: ReturnType<typeof evaluateMaturityGate>;
    action: RecommendationAction;
    analysis: Awaited<ReturnType<typeof analyzeItem>>;
    stability: ReturnType<typeof evaluateStabilityGate>;
  }>
): Promise<Recommendation[]> {
  const start = Date.now();

  // Build recommendations
  const recommendations: RankedRecommendation[] = items.map(input => {
    return buildRecommendation({
      item: input.item,
      profile: ctx.profile,
      preFilterMatch: input.match,
      analyzerOutput: input.analysis,
      stability: input.stability,
      action: input.action,
    });
  });

  // Deduplicate by subject
  const deduped = deduplicateBySubject(recommendations);

  // Rank and cap
  const maxRecs = ctx.profile.scouting.maxRecommendations;
  const final = rankAndCap(deduped, maxRecs);

  ctx.timing.ranking = Date.now() - start;

  // Log summary
  const summary = getRecommendationsSummary(recommendations);
  logger.info('Ranking stage completed', {
    traceId: ctx.traceId,
    total: recommendations.length,
    deduped: deduped.length,
    capped: final.length,
    maxAllowed: maxRecs,
    summary: summary.byPriority,
    durationMs: ctx.timing.ranking,
  });

  // Remove internal ranking score before returning
  return final.map(({ rankingScore, ...rec }) => rec);
}

// ============================================================
// MAIN ORCHESTRATOR
// ============================================================

/**
 * Run the complete matching pipeline.
 */
export async function runMatchingPipeline(
  items: FeedItem[],
  profile: ProjectProfile,
  config: MatchingConfig = {}
): Promise<MatchingResult> {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };
  const traceId = generateTraceId('MATCH');
  const startTime = Date.now();

  logger.info('Starting matching pipeline', {
    traceId,
    projectId: profile.project.id,
    itemCount: items.length,
  });

  const ctx: PipelineContext = {
    items,
    profile,
    config: mergedConfig,
    traceId,
    errors: [],
    timing: {},
  };

  try {
    // Stage 1: Pre-filter
    const { matches, passedItems } = await stagePreFilter(ctx);

    // Stage 2: Maturity gate
    const { passed: maturityPassed } = await stageMaturity(ctx, passedItems, matches);

    // Stage 3: LLM Analysis
    const analyzed = await stageAnalysis(ctx, maturityPassed);

    // Stage 4: Stability gate
    const stabilityResults = await stageStability(ctx, analyzed);

    // Stage 5: Ranking and capping
    const recommendations = await stageRanking(ctx, stabilityResults);

    const totalMs = Date.now() - startTime;

    const result: MatchingResult = {
      projectId: profile.project.id,
      traceId,
      recommendations,
      summary: {
        feedItemsEvaluated: items.length,
        passedPreFilter: passedItems.length,
        passedMaturity: maturityPassed.length,
        analyzed: analyzed.length,
        recommended: stabilityResults.filter(r => r.stability.verdict === 'RECOMMEND').length,
        delivered: recommendations.length,
      },
      timing: {
        preFilterMs: ctx.timing.preFilter || 0,
        maturityMs: ctx.timing.maturity || 0,
        analysisMs: ctx.timing.analysis || 0,
        stabilityMs: ctx.timing.stability || 0,
        rankingMs: ctx.timing.ranking || 0,
        totalMs,
      },
      errors: ctx.errors,
    };

    logger.info('Matching pipeline completed', {
      traceId,
      projectId: profile.project.id,
      delivered: recommendations.length,
      totalMs,
      errors: ctx.errors.length,
    });

    return result;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('Matching pipeline failed', {
      traceId,
      error: errorMsg,
    });

    return {
      projectId: profile.project.id,
      traceId,
      recommendations: [],
      summary: {
        feedItemsEvaluated: items.length,
        passedPreFilter: 0,
        passedMaturity: 0,
        analyzed: 0,
        recommended: 0,
        delivered: 0,
      },
      timing: {
        preFilterMs: ctx.timing.preFilter || 0,
        maturityMs: ctx.timing.maturity || 0,
        analysisMs: ctx.timing.analysis || 0,
        stabilityMs: ctx.timing.stability || 0,
        rankingMs: ctx.timing.ranking || 0,
        totalMs: Date.now() - startTime,
      },
      errors: [...ctx.errors, errorMsg],
    };
  }
}

/**
 * Run matching for multiple projects.
 */
export async function runMatchingForProjects(
  items: FeedItem[],
  profiles: ProjectProfile[],
  config: MatchingConfig = {}
): Promise<Map<string, MatchingResult>> {
  const results = new Map<string, MatchingResult>();

  logger.info('Starting multi-project matching', {
    itemCount: items.length,
    projectCount: profiles.length,
  });

  for (const profile of profiles) {
    const result = await runMatchingPipeline(items, profile, config);
    results.set(profile.project.id, result);
  }

  const totalDelivered = Array.from(results.values())
    .reduce((sum, r) => sum + r.recommendations.length, 0);

  logger.info('Multi-project matching completed', {
    projectCount: profiles.length,
    totalDelivered,
  });

  return results;
}
