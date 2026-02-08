/**
 * TechScout — Pre-Filter (Layer 3, Step 1)
 *
 * Deterministic filtering, zero LLM usage.
 * Reduces ~200 items/day to ~15-30 candidates.
 *
 * Filters based on:
 * - Technology overlap with project stack
 * - Category relevance to focus areas
 * - Exclusion of unwanted categories
 * - Pain point keyword matching
 * - Traction thresholds
 */

import type {
  FeedItem,
  ProjectProfile,
  PreFilterMatch,
  PreFilterBatchResult,
} from '../types';
import { logger } from '../lib/logger';

// ============================================================
// CONFIGURATION
// ============================================================

interface PreFilterConfig {
  /** Minimum technology overlap score (0-1) to pass */
  minTechOverlap: number;
  /** Minimum category relevance score (0-1) to pass */
  minCategoryRelevance: number;
  /** Minimum traction score to pass */
  minTraction: number;
  /** Boost for pain point matches */
  painPointBoost: number;
  /** Maximum items to pass through */
  maxOutputItems: number;
}

const DEFAULT_CONFIG: PreFilterConfig = {
  minTechOverlap: 0.1,
  minCategoryRelevance: 0.1,
  minTraction: 10,
  painPointBoost: 0.3,
  maxOutputItems: 30,
};

// ============================================================
// SCORE CALCULATIONS
// ============================================================

/**
 * Calculate technology overlap score.
 * Higher score = more overlap with project stack.
 */
function calculateTechOverlap(
  itemTech: string[],
  projectStack: ProjectProfile['stack']
): { score: number; matches: string[] } {
  const projectTech = new Set<string>();

  // Collect all project technologies (lowercase)
  projectStack.languages.forEach(l => projectTech.add(l.name.toLowerCase()));
  projectStack.frameworks.forEach(f => projectTech.add(f.name.toLowerCase()));
  projectStack.keyDependencies.forEach(d => projectTech.add(d.name.toLowerCase()));
  projectStack.databases?.forEach(d => projectTech.add(d.name.toLowerCase()));

  // Also add ecosystems
  Object.keys(projectStack.allDependencies).forEach(eco =>
    projectTech.add(eco.toLowerCase())
  );

  const itemTechLower = itemTech.map(t => t.toLowerCase());
  const matches: string[] = [];

  for (const tech of itemTechLower) {
    // Direct match
    if (projectTech.has(tech)) {
      matches.push(tech);
      continue;
    }

    // Fuzzy match (e.g., "nextjs" matches "next.js")
    for (const projTech of projectTech) {
      if (
        tech.replace(/[.-]/g, '').includes(projTech.replace(/[.-]/g, '')) ||
        projTech.replace(/[.-]/g, '').includes(tech.replace(/[.-]/g, ''))
      ) {
        matches.push(tech);
        break;
      }
    }
  }

  const score = itemTechLower.length > 0
    ? matches.length / itemTechLower.length
    : 0;

  return { score, matches };
}

/**
 * Calculate category relevance score.
 * Higher score = more relevant to focus areas.
 */
function calculateCategoryRelevance(
  itemCategories: string[],
  focusAreas: string[],
  excludeCategories: string[]
): { score: number; matches: string[]; excluded: boolean } {
  const focusSet = new Set(focusAreas.map(f => f.toLowerCase()));
  const excludeSet = new Set(excludeCategories.map(e => e.toLowerCase()));
  const itemCatsLower = itemCategories.map(c => c.toLowerCase());

  // Check for exclusions first
  for (const cat of itemCatsLower) {
    if (excludeSet.has(cat)) {
      return { score: 0, matches: [], excluded: true };
    }
  }

  // Calculate focus area matches
  const matches: string[] = [];
  for (const cat of itemCatsLower) {
    if (focusSet.has(cat)) {
      matches.push(cat);
    }
  }

  // If no focus areas defined, all categories are relevant
  const score = focusSet.size > 0
    ? (matches.length > 0 ? matches.length / focusSet.size : 0.5)
    : 0.5;

  return { score, matches, excluded: false };
}

/**
 * Calculate pain point relevance.
 * Returns boost if item seems to address a pain point.
 */
function calculatePainPointRelevance(
  item: FeedItem,
  painPoints: string[]
): { matches: string[]; boost: number } {
  if (painPoints.length === 0) {
    return { matches: [], boost: 0 };
  }

  const matches: string[] = [];
  const itemText = `${item.title} ${item.description || ''} ${item.contentSummary || ''}`.toLowerCase();

  for (const painPoint of painPoints) {
    // Extract keywords from pain point
    const keywords = painPoint.toLowerCase()
      .split(/\s+/)
      .filter(w => w.length > 4); // Only meaningful words

    // Check if item mentions any pain point keywords
    const keywordMatches = keywords.filter(kw => itemText.includes(kw));
    if (keywordMatches.length >= 2) {
      matches.push(painPoint);
    }
  }

  const boost = matches.length > 0 ? 0.3 * Math.min(1, matches.length / 2) : 0;
  return { matches, boost };
}

/**
 * Calculate traction score from signals.
 */
function calculateTractionScore(item: FeedItem): number {
  const t = item.traction;

  // Weighted combination of traction signals
  let score = 0;

  if (t.hnPoints) score += t.hnPoints * 0.5;
  if (t.githubStars) score += Math.min(t.githubStars, 10000) * 0.01;
  if (t.phUpvotes) score += t.phUpvotes * 0.3;
  if (t.npmWeeklyDownloads) score += Math.log10(t.npmWeeklyDownloads + 1) * 10;
  if (t.points) score += t.points * 0.2;

  return score;
}

/**
 * Check if item is from a relevant ecosystem.
 */
function isRelevantEcosystem(
  itemEcosystems: string[],
  projectEcosystems: string[]
): boolean {
  if (itemEcosystems.length === 0) return true; // No ecosystem restriction
  if (projectEcosystems.length === 0) return true;

  const projectSet = new Set(projectEcosystems.map(e => e.toLowerCase()));
  return itemEcosystems.some(e => projectSet.has(e.toLowerCase()));
}

// ============================================================
// MAIN PRE-FILTER
// ============================================================

/**
 * Pre-filter a single item against a project profile.
 */
export function preFilterItem(
  item: FeedItem,
  profile: ProjectProfile,
  config: PreFilterConfig = DEFAULT_CONFIG
): PreFilterMatch {
  // Calculate scores
  const techOverlap = calculateTechOverlap(item.technologies, profile.stack);
  const categoryRelevance = calculateCategoryRelevance(
    item.categories,
    profile.scouting.focusAreas,
    profile.scouting.excludeCategories
  );
  const painPointRelevance = calculatePainPointRelevance(
    item,
    profile.manifest.painPoints
  );
  const tractionScore = calculateTractionScore(item);

  // Check exclusions
  if (categoryRelevance.excluded) {
    return {
      feedItemId: item.id,
      projectId: profile.project.id,
      matchScore: 0,
      matchReasons: ['Excluded category'],
      technologiesMatched: [],
      categoriesMatched: [],
      passedFilter: false,
      filteredAt: new Date().toISOString(),
    };
  }

  // Check ecosystem relevance
  const projectEcosystems = Object.keys(profile.stack.allDependencies);
  if (!isRelevantEcosystem(item.languageEcosystems, projectEcosystems)) {
    return {
      feedItemId: item.id,
      projectId: profile.project.id,
      matchScore: 0,
      matchReasons: ['Irrelevant ecosystem'],
      technologiesMatched: [],
      categoriesMatched: [],
      passedFilter: false,
      filteredAt: new Date().toISOString(),
    };
  }

  // Calculate composite score
  let matchScore = 0;
  const matchReasons: string[] = [];

  // Tech overlap (40% weight)
  matchScore += techOverlap.score * 0.4;
  if (techOverlap.matches.length > 0) {
    matchReasons.push(`Tech match: ${techOverlap.matches.join(', ')}`);
  }

  // Category relevance (30% weight)
  matchScore += categoryRelevance.score * 0.3;
  if (categoryRelevance.matches.length > 0) {
    matchReasons.push(`Focus area: ${categoryRelevance.matches.join(', ')}`);
  }

  // Traction (20% weight)
  const normalizedTraction = Math.min(1, tractionScore / 500);
  matchScore += normalizedTraction * 0.2;
  if (tractionScore >= config.minTraction) {
    matchReasons.push(`Traction: ${Math.round(tractionScore)}`);
  }

  // Pain point boost (10% weight + boost)
  matchScore += painPointRelevance.boost * 0.1;
  if (painPointRelevance.matches.length > 0) {
    matchReasons.push(`Pain point match`);
    matchScore += config.painPointBoost;
  }

  // Normalize score to 0-1
  matchScore = Math.min(1, matchScore);

  // Determine if passed filter
  const passedFilter =
    matchScore >= Math.max(config.minTechOverlap, config.minCategoryRelevance) &&
    tractionScore >= config.minTraction;

  return {
    feedItemId: item.id,
    projectId: profile.project.id,
    matchScore: Math.round(matchScore * 100) / 100,
    matchReasons,
    technologiesMatched: techOverlap.matches,
    categoriesMatched: categoryRelevance.matches,
    passedFilter,
    filteredAt: new Date().toISOString(),
  };
}

/**
 * Pre-filter a batch of items against a project profile.
 */
export function preFilterBatch(
  items: FeedItem[],
  profile: ProjectProfile,
  config: PreFilterConfig = DEFAULT_CONFIG
): PreFilterBatchResult {
  const matches: PreFilterMatch[] = [];
  let passed = 0;
  let rejected = 0;

  for (const item of items) {
    const match = preFilterItem(item, profile, config);
    matches.push(match);

    if (match.passedFilter) {
      passed++;
    } else {
      rejected++;
    }
  }

  // Sort by score and limit to maxOutputItems
  const sortedMatches = matches
    .filter(m => m.passedFilter)
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, config.maxOutputItems);

  logger.info('Pre-filter completed', {
    projectId: profile.project.id,
    total: items.length,
    passed,
    rejected,
    output: sortedMatches.length,
  });

  return {
    projectId: profile.project.id,
    feedItemsEvaluated: items.length,
    feedItemsPassed: passed,
    feedItemsRejected: rejected,
    processedAt: new Date().toISOString(),
    matches: sortedMatches,
  };
}

/**
 * Get feed items that passed pre-filter for a project.
 */
export function getPassedItems(
  items: FeedItem[],
  matches: PreFilterMatch[]
): FeedItem[] {
  const passedIds = new Set(
    matches.filter(m => m.passedFilter).map(m => m.feedItemId)
  );

  return items.filter(item => passedIds.has(item.id));
}

/**
 * Create a pre-filter configuration from project settings.
 */
export function createConfigFromProfile(profile: ProjectProfile): PreFilterConfig {
  // Adjust sensitivity based on stack health
  // Lower health = more lenient filtering (need more recommendations)
  const healthScore = profile.stackHealth.overallScore;

  return {
    minTechOverlap: healthScore > 0.8 ? 0.15 : healthScore > 0.5 ? 0.1 : 0.05,
    minCategoryRelevance: healthScore > 0.8 ? 0.15 : 0.1,
    minTraction: healthScore > 0.8 ? 50 : healthScore > 0.5 ? 20 : 10,
    painPointBoost: profile.manifest.painPoints.length > 0 ? 0.3 : 0,
    maxOutputItems: profile.scouting.maxRecommendations * 6, // 6x to give LLM enough to work with
  };
}
