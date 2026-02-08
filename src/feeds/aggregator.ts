/**
 * TechScout — Feed Aggregator
 *
 * Orchestrates the complete feed ingestion pipeline:
 * 1. Fetch from all enabled sources
 * 2. Normalize raw items to unified format
 * 3. Deduplicate against database
 * 4. Store new items
 * 5. Return batch result for Layer 3 processing
 */

import type { FeedItem, FeedSourceName, FeedSourceTier } from '../types';
import { getAllSources, getSource, FeedSource } from './base';
import { normalizeItems } from './normalizer';
import { deduplicate, storeNewItems, deduplicateInMemory } from './dedup';
import { logger } from '../lib/logger';

// ============================================================
// TYPES
// ============================================================

export interface AggregatorConfig {
  /** Which sources to fetch from (default: all enabled) */
  sources?: FeedSourceName[];
  /** Only fetch from specific tiers */
  tiers?: FeedSourceTier[];
  /** Skip database storage (for dry runs) */
  dryRun?: boolean;
  /** Maximum items per source */
  maxItemsPerSource?: number;
  /** Timeout per source in ms */
  sourceTimeoutMs?: number;
  /** Continue on source errors */
  continueOnError?: boolean;
}

export interface SourceFetchResult {
  sourceName: FeedSourceName;
  tier: FeedSourceTier;
  rawItemCount: number;
  normalizedItemCount: number;
  fetchDurationMs: number;
  error?: string;
}

export interface AggregatorResult {
  /** Total raw items fetched across all sources */
  totalRawItems: number;
  /** Total items after normalization */
  totalNormalizedItems: number;
  /** Total items after deduplication */
  totalNewItems: number;
  /** Items successfully stored in database */
  storedItems: number;
  /** Duplicate items filtered out */
  duplicatesFiltered: number;
  /** Per-source breakdown */
  sourceResults: SourceFetchResult[];
  /** New items ready for Layer 3 processing */
  items: FeedItem[];
  /** Pipeline duration in ms */
  durationMs: number;
  /** Timestamp */
  completedAt: string;
  /** Errors encountered */
  errors: string[];
}

const DEFAULT_CONFIG: Required<AggregatorConfig> = {
  sources: [],
  tiers: [],
  dryRun: false,
  maxItemsPerSource: 100,
  sourceTimeoutMs: 30000,
  continueOnError: true,
};

// ============================================================
// FETCH HELPERS
// ============================================================

/**
 * Fetch from a single source with timeout.
 */
async function fetchFromSource(
  source: FeedSource,
  config: Required<AggregatorConfig>
): Promise<SourceFetchResult> {
  const startTime = Date.now();

  try {
    // Create timeout promise
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(
        () => reject(new Error(`Timeout after ${config.sourceTimeoutMs}ms`)),
        config.sourceTimeoutMs
      );
    });

    // Race fetch against timeout
    const rawItems = await Promise.race([
      source.fetch(),
      timeoutPromise,
    ]);

    // Limit items per source
    const limitedItems = rawItems.slice(0, config.maxItemsPerSource);

    // Normalize
    const normalizedItems = normalizeItems(limitedItems);

    const durationMs = Date.now() - startTime;

    logger.info('Source fetch completed', {
      source: source.name,
      rawItems: limitedItems.length,
      normalizedItems: normalizedItems.length,
      durationMs,
    });

    return {
      sourceName: source.name,
      tier: source.tier,
      rawItemCount: limitedItems.length,
      normalizedItemCount: normalizedItems.length,
      fetchDurationMs: durationMs,
    };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    logger.warn('Source fetch failed', {
      source: source.name,
      error: errorMessage,
      durationMs,
    });

    return {
      sourceName: source.name,
      tier: source.tier,
      rawItemCount: 0,
      normalizedItemCount: 0,
      fetchDurationMs: durationMs,
      error: errorMessage,
    };
  }
}

/**
 * Filter sources based on config.
 */
function filterSources(
  allSources: FeedSource[],
  config: Required<AggregatorConfig>
): FeedSource[] {
  let sources = allSources;

  // Filter by specific source names
  if (config.sources.length > 0) {
    const sourceSet = new Set(config.sources);
    sources = sources.filter(s => sourceSet.has(s.name));
  }

  // Filter by tier
  if (config.tiers.length > 0) {
    const tierSet = new Set(config.tiers);
    sources = sources.filter(s => tierSet.has(s.tier));
  }

  return sources;
}

// ============================================================
// MAIN AGGREGATOR
// ============================================================

/**
 * Run the complete feed aggregation pipeline.
 */
export async function aggregateFeeds(
  config: AggregatorConfig = {}
): Promise<AggregatorResult> {
  const startTime = Date.now();
  const mergedConfig: Required<AggregatorConfig> = { ...DEFAULT_CONFIG, ...config };

  logger.info('Starting feed aggregation', {
    dryRun: mergedConfig.dryRun,
    sourcesFilter: mergedConfig.sources.length || 'all',
    tiersFilter: mergedConfig.tiers.length || 'all',
  });

  const allSources = getAllSources();
  const filteredSources = filterSources(allSources, mergedConfig);

  if (filteredSources.length === 0) {
    logger.warn('No sources to fetch from');
    return {
      totalRawItems: 0,
      totalNormalizedItems: 0,
      totalNewItems: 0,
      storedItems: 0,
      duplicatesFiltered: 0,
      sourceResults: [],
      items: [],
      durationMs: Date.now() - startTime,
      completedAt: new Date().toISOString(),
      errors: ['No sources configured or matching filter'],
    };
  }

  // Phase 1: Fetch from all sources
  const sourceResults: SourceFetchResult[] = [];
  const allNormalizedItems: FeedItem[] = [];
  const errors: string[] = [];

  for (const source of filteredSources) {
    const result = await fetchFromSource(source, mergedConfig);
    sourceResults.push(result);

    if (result.error) {
      errors.push(`${source.name}: ${result.error}`);
      if (!mergedConfig.continueOnError) {
        break;
      }
    }
  }

  // Phase 2: Collect all normalized items
  // We need to re-fetch and normalize since we don't store them in the result
  for (const source of filteredSources) {
    try {
      const rawItems = await source.fetch();
      const limited = rawItems.slice(0, mergedConfig.maxItemsPerSource);
      const normalized = normalizeItems(limited);
      allNormalizedItems.push(...normalized);
    } catch {
      // Already logged in Phase 1
    }
  }

  const totalRawItems = sourceResults.reduce((sum, r) => sum + r.rawItemCount, 0);
  const totalNormalizedItems = allNormalizedItems.length;

  logger.info('Feed fetch phase completed', {
    sources: sourceResults.length,
    totalRaw: totalRawItems,
    totalNormalized: totalNormalizedItems,
  });

  // Phase 3: Deduplicate
  let newItems: FeedItem[] = [];
  let duplicatesFiltered = 0;

  if (mergedConfig.dryRun) {
    // In dry run mode, only do in-memory dedup
    const memResult = deduplicateInMemory(allNormalizedItems);
    newItems = memResult.newItems;
    duplicatesFiltered = memResult.duplicateCount;
  } else {
    // Full dedup against database
    const dedupResult = await deduplicate(allNormalizedItems);
    newItems = dedupResult.newItems;
    duplicatesFiltered = dedupResult.duplicateCount;
  }

  logger.info('Deduplication completed', {
    before: totalNormalizedItems,
    after: newItems.length,
    duplicates: duplicatesFiltered,
  });

  // Phase 4: Store new items
  let storedItems = 0;

  if (!mergedConfig.dryRun && newItems.length > 0) {
    const storeResult = await storeNewItems(newItems);
    storedItems = storeResult.stored;

    if (storeResult.failed > 0) {
      errors.push(`Failed to store ${storeResult.failed} items`);
    }
  }

  const durationMs = Date.now() - startTime;

  logger.info('Feed aggregation completed', {
    totalRaw: totalRawItems,
    totalNormalized: totalNormalizedItems,
    newItems: newItems.length,
    stored: storedItems,
    duplicates: duplicatesFiltered,
    durationMs,
    errors: errors.length,
  });

  return {
    totalRawItems,
    totalNormalizedItems,
    totalNewItems: newItems.length,
    storedItems,
    duplicatesFiltered,
    sourceResults,
    items: newItems,
    durationMs,
    completedAt: new Date().toISOString(),
    errors,
  };
}

/**
 * Fetch from a single source (useful for testing/debugging).
 */
export async function fetchSingleSource(
  sourceName: FeedSourceName,
  config: Partial<AggregatorConfig> = {}
): Promise<AggregatorResult> {
  return aggregateFeeds({
    ...config,
    sources: [sourceName],
  });
}

/**
 * Fetch from Tier 1 sources only (high signal).
 */
export async function fetchTier1Only(
  config: Partial<AggregatorConfig> = {}
): Promise<AggregatorResult> {
  return aggregateFeeds({
    ...config,
    tiers: ['tier1_high_signal'],
  });
}

/**
 * Dry run aggregation (no database writes).
 */
export async function dryRunAggregate(
  config: Partial<AggregatorConfig> = {}
): Promise<AggregatorResult> {
  return aggregateFeeds({
    ...config,
    dryRun: true,
  });
}

/**
 * Get aggregation statistics without fetching.
 */
export function getAggregatorStats(): {
  totalSources: number;
  sourcesByTier: Record<FeedSourceTier, number>;
  sourcesList: Array<{ name: FeedSourceName; tier: FeedSourceTier }>;
} {
  const sources = getAllSources();

  const sourcesByTier: Record<FeedSourceTier, number> = {
    tier1_high_signal: 0,
    tier2_curated: 0,
    tier3_community: 0,
    conditional: 0,
  };

  for (const source of sources) {
    sourcesByTier[source.tier]++;
  }

  return {
    totalSources: sources.length,
    sourcesByTier,
    sourcesList: sources.map(s => ({ name: s.name, tier: s.tier })),
  };
}
