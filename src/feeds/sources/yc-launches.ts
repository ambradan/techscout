/**
 * TechScout — Y Combinator Launches Feed Source
 *
 * Fetches YC Launch posts from Hacker News.
 * Filters for posts with "Launch HN:" prefix in the title.
 *
 * Tier 1: High Signal
 * Reliability: High
 */

import { FeedSource, registerSource } from '../base';
import type { RawFeedItem, FeedSourceName, FeedSourceTier, KQRReliability } from '../../types';

const HN_API_BASE = 'https://hacker-news.firebaseio.com/v0';

interface HNStory {
  id: number;
  title: string;
  url?: string;
  text?: string;
  score: number;
  by: string;
  time: number;
  descendants?: number; // comment count
  type: string;
}

/**
 * Y Combinator Launch HN feed.
 * Fetches from HN Show stories and filters for "Launch HN:" prefix.
 */
export class YCLaunchesSource extends FeedSource {
  readonly name: FeedSourceName = 'y_combinator_launches';
  readonly tier: FeedSourceTier = 'tier1_high_signal';
  readonly reliability: KQRReliability = 'high';
  readonly fetchMethod = 'api' as const;
  readonly frequency = 'daily' as const;

  private readonly minScore: number;
  private readonly maxItems: number;
  private readonly daysBack: number;

  constructor(options: { minScore?: number; maxItems?: number; daysBack?: number } = {}) {
    super();
    this.minScore = options.minScore ?? 20;
    this.maxItems = options.maxItems ?? 20;
    this.daysBack = options.daysBack ?? 7; // Look back 7 days for launches
  }

  async fetch(): Promise<RawFeedItem[]> {
    // Fetch Show HN story IDs (Launch HN posts are a subset of Show HN)
    const showStoriesRes = await fetch(`${HN_API_BASE}/showstories.json`);
    if (!showStoriesRes.ok) {
      throw new Error(`Failed to fetch show stories: ${showStoriesRes.status}`);
    }

    const storyIds = (await showStoriesRes.json()) as number[];

    // Fetch stories in parallel (more than we need since we'll filter)
    const fetchLimit = Math.min(storyIds.length, 100);
    const topIds = storyIds.slice(0, fetchLimit);
    const stories = await Promise.all(
      topIds.map(id => this.fetchStory(id))
    );

    // Calculate cutoff time
    const cutoffTime = Date.now() / 1000 - (this.daysBack * 24 * 60 * 60);

    // Filter for Launch HN posts
    const launchStories = stories
      .filter((s): s is HNStory => {
        if (!s) return false;
        // Must have "Launch HN:" prefix (case-insensitive)
        if (!this.isLaunchHN(s.title)) return false;
        // Must meet minimum score
        if (s.score < this.minScore) return false;
        // Must be within time window
        if (s.time < cutoffTime) return false;
        return true;
      })
      .slice(0, this.maxItems);

    this.logger.info('YC Launches fetched', {
      total: stories.filter(s => s !== null).length,
      launches: launchStories.length,
    });

    // Convert to raw items
    return launchStories.map(story => ({
      sourceName: this.name,
      fetchedAt: new Date().toISOString(),
      rawData: story,
    }));
  }

  /**
   * Check if a title is a Launch HN post.
   */
  private isLaunchHN(title: string): boolean {
    const titleLower = title.toLowerCase();
    // Common patterns for YC launches
    return (
      titleLower.startsWith('launch hn:') ||
      titleLower.startsWith('launch hn –') ||
      titleLower.startsWith('launch hn -') ||
      titleLower.includes('(yc ') || // e.g., "MyApp (YC S24)"
      titleLower.includes('(yc)') ||
      // Some launches use "Launching" format
      (titleLower.startsWith('launching ') && titleLower.includes('hn'))
    );
  }

  private async fetchStory(id: number): Promise<HNStory | null> {
    try {
      const res = await fetch(`${HN_API_BASE}/item/${id}.json`);
      if (!res.ok) return null;
      return (await res.json()) as HNStory | null;
    } catch {
      return null;
    }
  }
}

// Register source
registerSource(new YCLaunchesSource());
