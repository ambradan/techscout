/**
 * TechScout — Feed Item Types v1.0
 *
 * Normalized items from all technology intelligence sources.
 * All feeds are normalized to this format before processing.
 */

import type { KQRReliability } from './kqr';

// ============================================================
// FEED SOURCE CONFIGURATION
// ============================================================

export type FeedSourceTier =
  | 'tier1_high_signal'   // HN, YC, TechCrunch, Product Hunt, GitHub Trending
  | 'tier2_curated'       // ThoughtWorks Radar, newsletters, VC blogs
  | 'tier3_community'     // Reddit, DEV.to
  | 'conditional';        // Activated per stack (Rust Weekly, Supabase Blog, etc.)

export type FeedSourceName =
  // Tier 1 - High Signal
  | 'hacker_news'
  | 'hacker_news_show'
  | 'y_combinator_launches'
  | 'y_combinator_companies'
  | 'techcrunch'
  | 'product_hunt'
  | 'github_trending'
  | 'github_releases'
  | 'npm_new_packages'
  | 'pypi_new_packages'
  // Tier 2 - Curated
  | 'thoughtworks_radar'
  | 'javascript_weekly'
  | 'python_weekly'
  | 'changelog'
  | 'tldr_newsletter'
  | 'a16z_blog'
  | 'sequoia_blog'
  | 'stratechery'
  | 'the_information'
  | 'lobsters'
  // Tier 3 - Community
  | 'reddit_programming'
  | 'reddit_webdev'
  | 'reddit_node'
  | 'reddit_python'
  | 'dev_to'
  // Conditional
  | 'this_week_in_rust'
  | 'go_weekly'
  | 'react_newsletter'
  | 'supabase_blog'
  | 'vercel_blog';

/**
 * Feed source configuration
 */
export interface FeedSourceConfig {
  name: FeedSourceName;
  tier: FeedSourceTier;
  reliability: KQRReliability;
  enabled: boolean;
  endpoint?: string;
  fetchMethod: 'rss' | 'api' | 'scrape' | 'graphql';
  frequency: 'hourly' | 'daily' | 'weekly';
  conditionalOn?: string[]; // Stack elements that activate this source
}

// ============================================================
// TRACTION SIGNALS
// ============================================================

export interface TractionSignals {
  // Hacker News
  hnPoints?: number;
  hnComments?: number;

  // GitHub
  githubStars?: number;
  githubStars30dGrowth?: string; // e.g., "+2100"
  githubForks?: number;
  githubOpenIssues?: number;
  githubContributors?: number;

  // npm
  npmWeeklyDownloads?: number;
  npmDailyDownloads?: number;

  // PyPI
  pypiMonthlyDownloads?: number;

  // Product Hunt
  phUpvotes?: number;
  phComments?: number;

  // Reddit
  redditScore?: number;
  redditComments?: number;

  // Generic
  points?: number;
  comments?: number;
}

// ============================================================
// FEED ITEM
// ============================================================

/**
 * Normalized feed item from any source
 */
export interface FeedItem {
  id: string;

  // Source identification
  sourceName: FeedSourceName;
  sourceTier: FeedSourceTier;
  sourceReliability: KQRReliability;
  externalId?: string; // ID from the source

  // Content
  title: string;
  url?: string;
  description?: string;
  contentSummary?: string; // AI-generated summary if applicable

  // Metadata
  publishedAt?: string;
  fetchedAt: string;

  // Classification (for pre-filtering)
  categories: string[];
  technologies: string[]; // Mentioned tech
  languageEcosystems: string[]; // npm, pip, cargo, etc.

  // Traction signals
  traction: TractionSignals;

  // Processing state
  isProcessed: boolean;
  processedAt?: string;

  // Deduplication
  contentHash?: string; // SHA-256 of normalized content
}

/**
 * Raw feed item before normalization
 */
export interface RawFeedItem {
  sourceName: FeedSourceName;
  fetchedAt: string;
  rawData: unknown;
}

// ============================================================
// DATABASE ENTITY TYPE
// ============================================================

export interface FeedItemEntity {
  id: string;
  source_name: string;
  source_tier: FeedSourceTier;
  source_reliability: KQRReliability;
  external_id: string | null;
  title: string;
  url: string | null;
  description: string | null;
  content_summary: string | null;
  published_at: string | null;
  fetched_at: string;
  categories: string[];
  technologies: string[];
  language_ecosystems: string[];
  traction: TractionSignals;
  is_processed: boolean;
  processed_at: string | null;
  content_hash: string | null;
}

// ============================================================
// FEED PROCESSING TYPES
// ============================================================

/**
 * Result of feed fetch operation
 */
export interface FeedFetchResult {
  sourceName: FeedSourceName;
  success: boolean;
  itemsFound: number;
  itemsNew: number;
  itemsDuplicate: number;
  fetchedAt: string;
  error?: string;
}

/**
 * Batch fetch result for multiple sources
 */
export interface FeedBatchResult {
  startedAt: string;
  completedAt: string;
  sourcesAttempted: number;
  sourcesSucceeded: number;
  sourcesFailed: number;
  totalItemsFound: number;
  totalItemsNew: number;
  results: FeedFetchResult[];
}

// ============================================================
// PRE-FILTER TYPES
// ============================================================

/**
 * Pre-filter match result (deterministic, no LLM)
 */
export interface PreFilterMatch {
  feedItemId: string;
  projectId: string;
  matchScore: number; // 0-1, based on tech/category overlap
  matchReasons: string[];
  technologiesMatched: string[];
  categoriesMatched: string[];
  passedFilter: boolean;
  filteredAt: string;
}

/**
 * Pre-filter batch result
 */
export interface PreFilterBatchResult {
  projectId: string;
  feedItemsEvaluated: number;
  feedItemsPassed: number;
  feedItemsRejected: number;
  processedAt: string;
  matches: PreFilterMatch[];
}
