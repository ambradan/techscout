/**
 * TechScout — Feeds Module
 *
 * Layer 2: Feed Aggregation
 * Aggregates 20+ tech sources into a unified feed.
 */

// Import all sources to register them
import './sources';

// Re-export public API
export {
  FeedSource,
  registerSource,
  getAllSources,
  getSource,
  getSourcesByTier,
} from './base';

export {
  normalizeItem,
  normalizeItems,
  getSourceMetadata,
} from './normalizer';

export {
  deduplicate,
  deduplicateInMemory,
  deduplicateAgainstDb,
  storeNewItems,
  mergeTractionSignals,
  calculateSimilarity,
  findSimilarItems,
  type DedupResult,
} from './dedup';

export {
  aggregateFeeds,
  fetchSingleSource,
  fetchTier1Only,
  dryRunAggregate,
  getAggregatorStats,
  type AggregatorConfig,
  type AggregatorResult,
  type SourceFetchResult,
} from './aggregator';
