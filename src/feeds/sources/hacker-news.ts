/**
 * TechScout — Hacker News Feed Source
 *
 * Fetches top stories and Show HN posts from Hacker News.
 * Uses the official HN Firebase API.
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
 * Hacker News Top Stories feed.
 */
export class HackerNewsSource extends FeedSource {
  readonly name: FeedSourceName = 'hacker_news';
  readonly tier: FeedSourceTier = 'tier1_high_signal';
  readonly reliability: KQRReliability = 'high';
  readonly fetchMethod = 'api' as const;
  readonly frequency = 'hourly' as const;

  private readonly minScore: number;
  private readonly maxItems: number;

  constructor(options: { minScore?: number; maxItems?: number } = {}) {
    super();
    this.minScore = options.minScore ?? 50;
    this.maxItems = options.maxItems ?? 30;
  }

  async fetch(): Promise<RawFeedItem[]> {
    // Fetch top story IDs
    const topStoriesRes = await fetch(`${HN_API_BASE}/topstories.json`);
    if (!topStoriesRes.ok) {
      throw new Error(`Failed to fetch top stories: ${topStoriesRes.status}`);
    }

    const storyIds = (await topStoriesRes.json()) as number[];

    // Fetch top N stories in parallel
    const topIds = storyIds.slice(0, this.maxItems * 2); // Fetch extra for filtering
    const stories = await Promise.all(
      topIds.map(id => this.fetchStory(id))
    );

    // Filter by score and limit
    const filteredStories = stories
      .filter((s): s is HNStory => s !== null && s.score >= this.minScore)
      .slice(0, this.maxItems);

    // Convert to raw items
    return filteredStories.map(story => ({
      sourceName: this.name,
      fetchedAt: new Date().toISOString(),
      rawData: story,
    }));
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

/**
 * Hacker News Show HN feed.
 */
export class HackerNewsShowSource extends FeedSource {
  readonly name: FeedSourceName = 'hacker_news_show';
  readonly tier: FeedSourceTier = 'tier1_high_signal';
  readonly reliability: KQRReliability = 'high';
  readonly fetchMethod = 'api' as const;
  readonly frequency = 'daily' as const;

  private readonly minScore: number;
  private readonly maxItems: number;

  constructor(options: { minScore?: number; maxItems?: number } = {}) {
    super();
    this.minScore = options.minScore ?? 30;
    this.maxItems = options.maxItems ?? 20;
  }

  async fetch(): Promise<RawFeedItem[]> {
    // Fetch Show HN story IDs
    const showStoriesRes = await fetch(`${HN_API_BASE}/showstories.json`);
    if (!showStoriesRes.ok) {
      throw new Error(`Failed to fetch show stories: ${showStoriesRes.status}`);
    }

    const storyIds = (await showStoriesRes.json()) as number[];

    // Fetch top N stories in parallel
    const topIds = storyIds.slice(0, this.maxItems * 2);
    const stories = await Promise.all(
      topIds.map(id => this.fetchStory(id))
    );

    // Filter by score and limit
    const filteredStories = stories
      .filter((s): s is HNStory => s !== null && s.score >= this.minScore)
      .slice(0, this.maxItems);

    return filteredStories.map(story => ({
      sourceName: this.name,
      fetchedAt: new Date().toISOString(),
      rawData: story,
    }));
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

// Register sources
registerSource(new HackerNewsSource());
registerSource(new HackerNewsShowSource());
