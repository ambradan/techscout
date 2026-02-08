/**
 * TechScout — npm New Packages Feed Source
 *
 * Fetches recently published packages from npm registry.
 * Filters for packages with significant traction.
 *
 * Tier 1: High Signal
 * Reliability: High
 */

import { FeedSource, registerSource } from '../base';
import type { RawFeedItem, FeedSourceName, FeedSourceTier, KQRReliability } from '../../types';

const NPM_REGISTRY = 'https://registry.npmjs.org';
const NPM_SEARCH = 'https://registry.npmjs.org/-/v1/search';

interface NpmPackage {
  name: string;
  version: string;
  description: string;
  keywords: string[];
  date: string;
  publisher: {
    username: string;
    email: string;
  };
  links: {
    npm: string;
    homepage?: string;
    repository?: string;
  };
  score: {
    final: number;
    detail: {
      quality: number;
      popularity: number;
      maintenance: number;
    };
  };
}

interface NpmSearchResult {
  objects: Array<{
    package: NpmPackage;
    score: NpmPackage['score'];
  }>;
  total: number;
}

/**
 * npm New Packages feed.
 * Searches for recently updated packages with high quality scores.
 */
export class NpmNewPackagesSource extends FeedSource {
  readonly name: FeedSourceName = 'npm_new_packages';
  readonly tier: FeedSourceTier = 'tier1_high_signal';
  readonly reliability: KQRReliability = 'high';
  readonly fetchMethod = 'api' as const;
  readonly frequency = 'daily' as const;

  private readonly categories: string[];
  private readonly minPopularity: number;
  private readonly maxItems: number;

  constructor(options: {
    categories?: string[];
    minPopularity?: number;
    maxItems?: number;
  } = {}) {
    super();
    this.categories = options.categories ?? [
      'framework',
      'cli',
      'typescript',
      'react',
      'vue',
      'database',
      'orm',
      'auth',
      'api',
    ];
    this.minPopularity = options.minPopularity ?? 0.1;
    this.maxItems = options.maxItems ?? 20;
  }

  async fetch(): Promise<RawFeedItem[]> {
    const allPackages: NpmPackage[] = [];
    const seenPackages = new Set<string>();

    // Search for each category
    for (const category of this.categories) {
      try {
        const packages = await this.searchPackages(category);
        for (const pkg of packages) {
          if (!seenPackages.has(pkg.name) && pkg.score.detail.popularity >= this.minPopularity) {
            seenPackages.add(pkg.name);
            allPackages.push(pkg);
          }
        }
      } catch (error) {
        this.logger.warn(`Failed to search npm for ${category}`, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Sort by score and limit
    const sortedPackages = allPackages
      .sort((a, b) => b.score.final - a.score.final)
      .slice(0, this.maxItems);

    return sortedPackages.map(pkg => ({
      sourceName: this.name,
      fetchedAt: new Date().toISOString(),
      rawData: pkg,
    }));
  }

  private async searchPackages(keyword: string): Promise<NpmPackage[]> {
    // Search for recently updated packages with keyword
    const params = new URLSearchParams({
      text: keyword,
      size: '25',
      quality: '0.5',
      popularity: '0.3',
      maintenance: '0.2',
    });

    const res = await fetch(`${NPM_SEARCH}?${params}`);
    if (!res.ok) {
      throw new Error(`npm search failed: ${res.status}`);
    }

    const data = (await res.json()) as NpmSearchResult;

    return data.objects.map(obj => ({
      ...obj.package,
      score: obj.score,
    }));
  }
}

/**
 * GitHub Releases for project dependencies.
 * Monitors releases of packages the project depends on.
 */
export class GitHubReleasesSource extends FeedSource {
  readonly name: FeedSourceName = 'github_releases';
  readonly tier: FeedSourceTier = 'tier1_high_signal';
  readonly reliability: KQRReliability = 'high';
  readonly fetchMethod = 'api' as const;
  readonly frequency = 'daily' as const;

  private readonly packages: Array<{ owner: string; repo: string }>;

  constructor(packages: Array<{ owner: string; repo: string }> = []) {
    super();
    // Default to monitoring popular packages
    this.packages = packages.length > 0 ? packages : [
      { owner: 'vercel', repo: 'next.js' },
      { owner: 'facebook', repo: 'react' },
      { owner: 'vitejs', repo: 'vite' },
      { owner: 'tailwindlabs', repo: 'tailwindcss' },
      { owner: 'supabase', repo: 'supabase' },
      { owner: 'trpc', repo: 'trpc' },
      { owner: 'drizzle-team', repo: 'drizzle-orm' },
    ];
  }

  async fetch(): Promise<RawFeedItem[]> {
    const releases: RawFeedItem[] = [];

    for (const pkg of this.packages) {
      try {
        const repoReleases = await this.fetchReleases(pkg.owner, pkg.repo);
        releases.push(...repoReleases.map(release => ({
          sourceName: this.name,
          fetchedAt: new Date().toISOString(),
          rawData: {
            ...release,
            owner: pkg.owner,
            repo: pkg.repo,
          },
        })));
      } catch (error) {
        this.logger.warn(`Failed to fetch releases for ${pkg.owner}/${pkg.repo}`, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return releases;
  }

  private async fetchReleases(owner: string, repo: string): Promise<Array<{
    tag_name: string;
    name: string;
    body: string;
    published_at: string;
    html_url: string;
    prerelease: boolean;
  }>> {
    const headers: Record<string, string> = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'TechScout/1.0',
    };

    if (process.env.GITHUB_TOKEN) {
      headers['Authorization'] = `Bearer ${process.env.GITHUB_TOKEN}`;
    }

    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/releases?per_page=5`,
      { headers }
    );

    if (!res.ok) {
      throw new Error(`GitHub API error: ${res.status}`);
    }

    return (await res.json()) as Array<{
      tag_name: string;
      name: string;
      body: string;
      published_at: string;
      html_url: string;
      prerelease: boolean;
    }>;
  }
}

// Register sources
registerSource(new NpmNewPackagesSource());
registerSource(new GitHubReleasesSource());
