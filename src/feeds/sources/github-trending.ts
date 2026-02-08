/**
 * TechScout — GitHub Trending Feed Source
 *
 * Fetches trending repositories from GitHub.
 * Uses the unofficial trending API or scrapes the trending page.
 *
 * Tier 1: High Signal
 * Reliability: High
 */

import { FeedSource, registerSource } from '../base';
import type { RawFeedItem, FeedSourceName, FeedSourceTier, KQRReliability } from '../../types';

/**
 * Raw trending repo data.
 */
interface TrendingRepo {
  rank: number;
  name: string;
  fullName: string;
  url: string;
  description: string | null;
  language: string | null;
  stars: number;
  starsToday: number;
  forks: number;
}

/**
 * GitHub Trending repositories feed.
 */
export class GitHubTrendingSource extends FeedSource {
  readonly name: FeedSourceName = 'github_trending';
  readonly tier: FeedSourceTier = 'tier1_high_signal';
  readonly reliability: KQRReliability = 'high';
  readonly fetchMethod = 'api' as const;
  readonly frequency = 'daily' as const;

  private readonly languages: string[];
  private readonly dateRange: 'daily' | 'weekly' | 'monthly';
  private readonly maxItems: number;

  constructor(options: {
    languages?: string[];
    dateRange?: 'daily' | 'weekly' | 'monthly';
    maxItems?: number;
  } = {}) {
    super();
    this.languages = options.languages ?? ['', 'typescript', 'javascript', 'python', 'rust', 'go'];
    this.dateRange = options.dateRange ?? 'daily';
    this.maxItems = options.maxItems ?? 25;
  }

  async fetch(): Promise<RawFeedItem[]> {
    const allRepos: TrendingRepo[] = [];
    const seenRepos = new Set<string>();

    // Fetch trending for each language
    for (const language of this.languages) {
      try {
        const repos = await this.fetchTrending(language);
        for (const repo of repos) {
          if (!seenRepos.has(repo.fullName)) {
            seenRepos.add(repo.fullName);
            allRepos.push(repo);
          }
        }
      } catch (error) {
        this.logger.warn(`Failed to fetch trending for ${language || 'all'}`, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Sort by stars today and limit
    const sortedRepos = allRepos
      .sort((a, b) => b.starsToday - a.starsToday)
      .slice(0, this.maxItems);

    return sortedRepos.map(repo => ({
      sourceName: this.name,
      fetchedAt: new Date().toISOString(),
      rawData: repo,
    }));
  }

  private async fetchTrending(language: string): Promise<TrendingRepo[]> {
    // Use the unofficial GitHub Trending API
    // This is a community-maintained API that scrapes the trending page
    const langParam = language ? `/${encodeURIComponent(language)}` : '';
    const url = `https://api.gitterapp.com/repositories${langParam}?since=${this.dateRange}`;

    try {
      const res = await fetch(url);
      if (!res.ok) {
        // Fallback: try alternative API
        return this.fetchTrendingFallback(language);
      }

      const data = await res.json();
      return (data as Array<{
        rank: number;
        username: string;
        repositoryName: string;
        url: string;
        description: string | null;
        language: string | null;
        totalStars: number;
        starsSince: number;
        forks: number;
      }>).map((item, index) => ({
        rank: item.rank || index + 1,
        name: item.repositoryName,
        fullName: `${item.username}/${item.repositoryName}`,
        url: item.url,
        description: item.description,
        language: item.language,
        stars: item.totalStars,
        starsToday: item.starsSince,
        forks: item.forks,
      }));
    } catch {
      return this.fetchTrendingFallback(language);
    }
  }

  private async fetchTrendingFallback(language: string): Promise<TrendingRepo[]> {
    // Fallback: Use GitHub Search API to find recently created popular repos
    const langQuery = language ? `language:${language}` : '';
    const query = `${langQuery} created:>${this.getDateThreshold()} stars:>100`;
    const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=10`;

    const headers: Record<string, string> = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'TechScout/1.0',
    };

    if (process.env.GITHUB_TOKEN) {
      headers['Authorization'] = `Bearer ${process.env.GITHUB_TOKEN}`;
    }

    const res = await fetch(url, { headers });
    if (!res.ok) {
      throw new Error(`GitHub API error: ${res.status}`);
    }

    const data = (await res.json()) as { items: Array<{
      full_name: string;
      name: string;
      html_url: string;
      description: string | null;
      language: string | null;
      stargazers_count: number;
      forks_count: number;
    }> };
    return data.items.map((item, index) => ({
      rank: index + 1,
      name: item.name,
      fullName: item.full_name,
      url: item.html_url,
      description: item.description,
      language: item.language,
      stars: item.stargazers_count,
      starsToday: 0, // Not available from search API
      forks: item.forks_count,
    }));
  }

  private getDateThreshold(): string {
    const date = new Date();
    switch (this.dateRange) {
      case 'daily':
        date.setDate(date.getDate() - 7);
        break;
      case 'weekly':
        date.setDate(date.getDate() - 30);
        break;
      case 'monthly':
        date.setDate(date.getDate() - 90);
        break;
    }
    return date.toISOString().split('T')[0];
  }
}

// Register source
registerSource(new GitHubTrendingSource());
