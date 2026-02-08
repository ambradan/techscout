/**
 * TechScout — Feed Item Types v1.1
 *
 * Normalized items from all technology intelligence sources.
 * All feeds are normalized to this format before processing.
 */

import { z } from 'zod';
import { KQRReliabilitySchema } from './kqr';
import type { KQRReliability } from './kqr';

// ============================================================
// FEED SOURCE TIER
// ============================================================

export const FeedSourceTierSchema = z.enum([
  'tier1_high_signal',   // HN, YC, TechCrunch, Product Hunt, GitHub Trending
  'tier2_curated',       // ThoughtWorks Radar, newsletters, VC blogs
  'tier3_community',     // Reddit, DEV.to
  'conditional',         // Activated per stack (Rust Weekly, Supabase Blog, etc.)
]);
export type FeedSourceTier = z.infer<typeof FeedSourceTierSchema>;

// ============================================================
// FEED SOURCE NAME
// ============================================================

export const FeedSourceNameSchema = z.enum([
  // Tier 1 - High Signal
  'hacker_news',
  'hacker_news_show',
  'y_combinator_launches',
  'y_combinator_companies',
  'techcrunch',
  'product_hunt',
  'github_trending',
  'github_releases',
  'npm_new_packages',
  'pypi_new_packages',
  // Tier 2 - Curated
  'thoughtworks_radar',
  'javascript_weekly',
  'python_weekly',
  'changelog',
  'tldr_newsletter',
  'a16z_blog',
  'sequoia_blog',
  'stratechery',
  'the_information',
  'lobsters',
  // Tier 3 - Community
  'reddit_programming',
  'reddit_webdev',
  'reddit_node',
  'reddit_python',
  'dev_to',
  // Conditional
  'this_week_in_rust',
  'go_weekly',
  'react_newsletter',
  'supabase_blog',
  'vercel_blog',
]);
export type FeedSourceName = z.infer<typeof FeedSourceNameSchema>;

// ============================================================
// FEED SOURCE CONFIGURATION
// ============================================================

export const FeedSourceConfigSchema = z.object({
  name: FeedSourceNameSchema,
  tier: FeedSourceTierSchema,
  reliability: KQRReliabilitySchema,
  enabled: z.boolean(),
  endpoint: z.string().url().optional(),
  fetchMethod: z.enum(['rss', 'api', 'scrape', 'graphql']),
  frequency: z.enum(['hourly', 'daily', 'weekly']),
  conditionalOn: z.array(z.string()).optional(),
});
export type FeedSourceConfig = z.infer<typeof FeedSourceConfigSchema>;

// ============================================================
// TRACTION SIGNALS
// ============================================================

export const TractionSignalsSchema = z.object({
  // Hacker News
  hnPoints: z.number().int().min(0).optional(),
  hnComments: z.number().int().min(0).optional(),

  // GitHub
  githubStars: z.number().int().min(0).optional(),
  githubStars30dGrowth: z.string().optional(),
  githubForks: z.number().int().min(0).optional(),
  githubOpenIssues: z.number().int().min(0).optional(),
  githubContributors: z.number().int().min(0).optional(),

  // npm
  npmWeeklyDownloads: z.number().int().min(0).optional(),
  npmDailyDownloads: z.number().int().min(0).optional(),

  // PyPI
  pypiMonthlyDownloads: z.number().int().min(0).optional(),

  // Product Hunt
  phUpvotes: z.number().int().min(0).optional(),
  phComments: z.number().int().min(0).optional(),

  // Reddit
  redditScore: z.number().int().optional(),
  redditComments: z.number().int().min(0).optional(),

  // Generic
  points: z.number().int().min(0).optional(),
  comments: z.number().int().min(0).optional(),
});
export type TractionSignals = z.infer<typeof TractionSignalsSchema>;

// ============================================================
// FEED ITEM
// ============================================================

// Flexible source type schema for items that may come from various sources
export const FeedSourceTypeSchema = z.enum([
  'hackernews',
  'github_trending',
  'npm',
  'product_hunt',
  'reddit',
  'dev_to',
  'rss',
  'other',
]);
export type FeedSourceType = z.infer<typeof FeedSourceTypeSchema>;

export const FeedItemSchema = z.object({
  id: z.string(),

  // Source identification - flexible to support both schemas
  sourceId: z.string().optional(),
  sourceType: FeedSourceTypeSchema.optional(),
  sourceName: FeedSourceNameSchema.optional(),
  sourceTier: FeedSourceTierSchema.optional(),
  sourceReliability: KQRReliabilitySchema.optional(),
  externalId: z.string().optional(),

  // Content
  title: z.string(),
  url: z.string().url().optional(),
  content: z.string().optional(),
  description: z.string().optional(),
  contentSummary: z.string().optional(),

  // Metadata
  publishedAt: z.string().datetime().optional(),
  fetchedAt: z.string().datetime(),
  normalizedAt: z.string().datetime().optional(),

  // Classification (for pre-filtering)
  categories: z.array(z.string()),
  technologies: z.array(z.string()),
  languageEcosystems: z.array(z.string()),

  // Traction signals
  traction: TractionSignalsSchema,

  // Processing state
  isProcessed: z.boolean().optional(),
  processedAt: z.string().datetime().optional(),

  // Deduplication
  contentHash: z.string().optional(),
});
export type FeedItem = z.infer<typeof FeedItemSchema>;

// ============================================================
// RAW FEED ITEM
// ============================================================

export const RawFeedItemSchema = z.object({
  sourceName: FeedSourceNameSchema,
  fetchedAt: z.string().datetime(),
  rawData: z.unknown(),
});
export type RawFeedItem = z.infer<typeof RawFeedItemSchema>;

// ============================================================
// DATABASE ENTITY TYPE
// ============================================================

export const FeedItemEntitySchema = z.object({
  id: z.string(),
  source_name: z.string(),
  source_tier: FeedSourceTierSchema,
  source_reliability: KQRReliabilitySchema,
  external_id: z.string().nullable(),
  title: z.string(),
  url: z.string().nullable(),
  description: z.string().nullable(),
  content_summary: z.string().nullable(),
  published_at: z.string().datetime().nullable(),
  fetched_at: z.string().datetime(),
  categories: z.array(z.string()),
  technologies: z.array(z.string()),
  language_ecosystems: z.array(z.string()),
  traction: TractionSignalsSchema,
  is_processed: z.boolean(),
  processed_at: z.string().datetime().nullable(),
  content_hash: z.string().nullable(),
});
export type FeedItemEntity = z.infer<typeof FeedItemEntitySchema>;

// ============================================================
// FEED PROCESSING TYPES
// ============================================================

export const FeedFetchResultSchema = z.object({
  sourceName: FeedSourceNameSchema,
  success: z.boolean(),
  itemsFound: z.number().int().min(0),
  itemsNew: z.number().int().min(0),
  itemsDuplicate: z.number().int().min(0),
  fetchedAt: z.string().datetime(),
  error: z.string().optional(),
});
export type FeedFetchResult = z.infer<typeof FeedFetchResultSchema>;

export const FeedBatchResultSchema = z.object({
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime(),
  sourcesAttempted: z.number().int().min(0),
  sourcesSucceeded: z.number().int().min(0),
  sourcesFailed: z.number().int().min(0),
  totalItemsFound: z.number().int().min(0),
  totalItemsNew: z.number().int().min(0),
  results: z.array(FeedFetchResultSchema),
});
export type FeedBatchResult = z.infer<typeof FeedBatchResultSchema>;

// ============================================================
// PRE-FILTER TYPES
// ============================================================

export const PreFilterMatchSchema = z.object({
  feedItemId: z.string(),
  projectId: z.string().optional(),
  matchScore: z.number().min(0).max(1),
  matchReasons: z.array(z.string()),
  technologiesMatched: z.array(z.string()),
  categoriesMatched: z.array(z.string()),
  passedFilter: z.boolean(),
  filteredAt: z.string().datetime().optional(),
});
export type PreFilterMatch = z.infer<typeof PreFilterMatchSchema>;

export const PreFilterBatchResultSchema = z.object({
  projectId: z.string(),
  feedItemsEvaluated: z.number().int().min(0),
  feedItemsPassed: z.number().int().min(0),
  feedItemsRejected: z.number().int().min(0),
  processedAt: z.string().datetime(),
  matches: z.array(PreFilterMatchSchema),
});
export type PreFilterBatchResult = z.infer<typeof PreFilterBatchResultSchema>;
