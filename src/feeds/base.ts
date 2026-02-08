/**
 * TechScout — Feed Source Base
 *
 * Abstract base class for all feed sources.
 * Each source must implement the fetch method and provide config.
 */

import type {
  FeedSourceName,
  FeedSourceTier,
  FeedSourceConfig,
  RawFeedItem,
  FeedFetchResult,
  KQRReliability,
} from '../types';
import { logger } from '../lib/logger';

/**
 * Abstract base class for feed sources.
 */
export abstract class FeedSource {
  abstract readonly name: FeedSourceName;
  abstract readonly tier: FeedSourceTier;
  abstract readonly reliability: KQRReliability;
  abstract readonly fetchMethod: 'rss' | 'api' | 'scrape' | 'graphql';
  abstract readonly frequency: 'hourly' | 'daily' | 'weekly';

  /**
   * Optional: stack elements that activate this source.
   * If defined, source is only active when project stack includes these.
   */
  conditionalOn?: string[];

  protected logger = logger.child({ source: this.constructor.name });

  /**
   * Get the source configuration.
   */
  getConfig(): FeedSourceConfig {
    return {
      name: this.name,
      tier: this.tier,
      reliability: this.reliability,
      enabled: true,
      fetchMethod: this.fetchMethod,
      frequency: this.frequency,
      conditionalOn: this.conditionalOn,
    };
  }

  /**
   * Fetch raw items from the source.
   * Must be implemented by each source.
   */
  abstract fetch(): Promise<RawFeedItem[]>;

  /**
   * Execute fetch with error handling and logging.
   */
  async safeFetch(): Promise<FeedFetchResult> {
    const startTime = Date.now();
    this.logger.info('Starting fetch');

    try {
      const rawItems = await this.fetch();

      const result: FeedFetchResult = {
        sourceName: this.name,
        success: true,
        itemsFound: rawItems.length,
        itemsNew: rawItems.length, // Will be updated after dedup
        itemsDuplicate: 0,
        fetchedAt: new Date().toISOString(),
      };

      this.logger.info('Fetch completed', {
        itemsFound: result.itemsFound,
        durationMs: Date.now() - startTime,
      });

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      this.logger.error('Fetch failed', { error: errorMessage });

      return {
        sourceName: this.name,
        success: false,
        itemsFound: 0,
        itemsNew: 0,
        itemsDuplicate: 0,
        fetchedAt: new Date().toISOString(),
        error: errorMessage,
      };
    }
  }
}

/**
 * Registry of all available feed sources.
 */
const sourceRegistry: Map<FeedSourceName, FeedSource> = new Map();

/**
 * Register a feed source.
 */
export function registerSource(source: FeedSource): void {
  sourceRegistry.set(source.name, source);
  logger.debug('Source registered', { name: source.name, tier: source.tier });
}

/**
 * Get a registered feed source by name.
 */
export function getSource(name: FeedSourceName): FeedSource | undefined {
  return sourceRegistry.get(name);
}

/**
 * Get all registered sources.
 */
export function getAllSources(): FeedSource[] {
  return Array.from(sourceRegistry.values());
}

/**
 * Get sources by tier.
 */
export function getSourcesByTier(tier: FeedSourceTier): FeedSource[] {
  return getAllSources().filter(s => s.tier === tier);
}

/**
 * Get sources applicable to a given stack.
 */
export function getSourcesForStack(stack: string[]): FeedSource[] {
  const stackLower = stack.map(s => s.toLowerCase());

  return getAllSources().filter(source => {
    if (!source.conditionalOn) return true;
    return source.conditionalOn.some(cond =>
      stackLower.some(s => s.includes(cond.toLowerCase()))
    );
  });
}
