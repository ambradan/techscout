/**
 * TechScout — Feed Normalizer
 *
 * Converts raw feed items from various sources into the
 * unified FeedItem format for processing.
 */

import { createHash } from 'crypto';
import type {
  RawFeedItem,
  FeedItem,
  FeedSourceName,
  FeedSourceTier,
  TractionSignals,
  KQRReliability,
} from '../types';
import { getSource } from './base';
import { logger } from '../lib/logger';

// ============================================================
// SOURCE-SPECIFIC NORMALIZERS
// ============================================================

interface HNStoryData {
  id: number;
  title: string;
  url?: string;
  text?: string;
  score: number;
  by: string;
  time: number;
  descendants?: number;
}

function normalizeHackerNews(raw: RawFeedItem): FeedItem | null {
  const data = raw.rawData as HNStoryData;
  if (!data || !data.title) return null;

  const categories = detectCategories(data.title + ' ' + (data.url || ''));
  const technologies = detectTechnologies(data.title + ' ' + (data.url || ''));

  return {
    id: '', // Will be set after dedup
    sourceName: raw.sourceName,
    sourceTier: 'tier1_high_signal',
    sourceReliability: 'high',
    externalId: String(data.id),
    title: data.title,
    url: data.url || `https://news.ycombinator.com/item?id=${data.id}`,
    description: data.text || undefined,
    publishedAt: new Date(data.time * 1000).toISOString(),
    fetchedAt: raw.fetchedAt,
    categories,
    technologies,
    languageEcosystems: detectEcosystems(technologies),
    traction: {
      hnPoints: data.score,
      hnComments: data.descendants || 0,
      points: data.score,
      comments: data.descendants || 0,
    },
    isProcessed: false,
    contentHash: generateContentHash(data.title, data.url || ''),
  };
}

interface TrendingRepoData {
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

function normalizeGitHubTrending(raw: RawFeedItem): FeedItem | null {
  const data = raw.rawData as TrendingRepoData;
  if (!data || !data.name) return null;

  const technologies = data.language ? [data.language] : [];
  if (data.description) {
    technologies.push(...detectTechnologies(data.description));
  }

  const categories = detectCategories(
    `${data.name} ${data.description || ''}`
  );

  return {
    id: '',
    sourceName: raw.sourceName,
    sourceTier: 'tier1_high_signal',
    sourceReliability: 'high',
    externalId: data.fullName,
    title: data.name,
    url: data.url,
    description: data.description || undefined,
    publishedAt: raw.fetchedAt, // GitHub trending doesn't give creation date
    fetchedAt: raw.fetchedAt,
    categories,
    technologies: [...new Set(technologies)],
    languageEcosystems: detectEcosystems(technologies),
    traction: {
      githubStars: data.stars,
      githubStars30dGrowth: `+${data.starsToday}`,
      points: data.starsToday,
    },
    isProcessed: false,
    contentHash: generateContentHash(data.fullName, data.url),
  };
}

interface NpmPackageData {
  name: string;
  version: string;
  description: string;
  keywords: string[];
  date: string;
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

function normalizeNpmPackage(raw: RawFeedItem): FeedItem | null {
  const data = raw.rawData as NpmPackageData;
  if (!data || !data.name) return null;

  const categories = detectCategories(
    `${data.name} ${data.description} ${data.keywords?.join(' ') || ''}`
  );
  const technologies = [
    'javascript',
    'node',
    ...(data.keywords || []).filter(k => TECH_KEYWORDS.includes(k.toLowerCase())),
  ];

  return {
    id: '',
    sourceName: raw.sourceName,
    sourceTier: 'tier1_high_signal',
    sourceReliability: 'high',
    externalId: `npm:${data.name}@${data.version}`,
    title: `${data.name}@${data.version}`,
    url: data.links.npm,
    description: data.description,
    publishedAt: data.date,
    fetchedAt: raw.fetchedAt,
    categories,
    technologies: [...new Set(technologies)],
    languageEcosystems: ['npm'],
    traction: {
      points: Math.round(data.score.final * 100),
    },
    isProcessed: false,
    contentHash: generateContentHash(data.name, data.version),
  };
}

interface GitHubReleaseData {
  owner: string;
  repo: string;
  tag_name: string;
  name: string;
  body: string;
  published_at: string;
  html_url: string;
  prerelease: boolean;
}

function normalizeGitHubRelease(raw: RawFeedItem): FeedItem | null {
  const data = raw.rawData as GitHubReleaseData;
  if (!data || !data.tag_name) return null;

  const fullName = `${data.owner}/${data.repo}`;
  const isBreakingChange = data.tag_name.match(/^v?\d+\.0\.0/) !== null ||
    (data.body || '').toLowerCase().includes('breaking change');

  const categories = ['release'];
  if (isBreakingChange) categories.push('breaking_change');

  return {
    id: '',
    sourceName: raw.sourceName,
    sourceTier: 'tier1_high_signal',
    sourceReliability: 'high',
    externalId: `github:${fullName}@${data.tag_name}`,
    title: `${fullName} ${data.tag_name}${data.name ? `: ${data.name}` : ''}`,
    url: data.html_url,
    description: data.body?.slice(0, 500),
    publishedAt: data.published_at,
    fetchedAt: raw.fetchedAt,
    categories,
    technologies: [],
    languageEcosystems: [],
    traction: {},
    isProcessed: false,
    contentHash: generateContentHash(fullName, data.tag_name),
  };
}

interface ProductHuntData {
  id: string;
  name: string;
  tagline: string;
  description: string;
  url: string;
  votesCount: number;
  commentsCount: number;
  createdAt: string;
  topics: Array<{ name: string }>;
  website: string;
}

function normalizeProductHunt(raw: RawFeedItem): FeedItem | null {
  const data = raw.rawData as ProductHuntData;
  if (!data || !data.name) return null;

  const categories = (data.topics || []).map(t => t.name.toLowerCase());
  const technologies = detectTechnologies(
    `${data.name} ${data.tagline} ${data.description}`
  );

  return {
    id: '',
    sourceName: raw.sourceName,
    sourceTier: 'tier1_high_signal',
    sourceReliability: 'high',
    externalId: `ph:${data.id}`,
    title: data.name,
    url: data.website || data.url,
    description: data.tagline,
    contentSummary: data.description?.slice(0, 300),
    publishedAt: data.createdAt,
    fetchedAt: raw.fetchedAt,
    categories,
    technologies,
    languageEcosystems: detectEcosystems(technologies),
    traction: {
      phUpvotes: data.votesCount,
      phComments: data.commentsCount,
      points: data.votesCount,
      comments: data.commentsCount,
    },
    isProcessed: false,
    contentHash: generateContentHash(data.name, data.website || data.url),
  };
}

// ============================================================
// DETECTION HELPERS
// ============================================================

const CATEGORY_PATTERNS: Record<string, RegExp> = {
  frontend: /\b(react|vue|angular|svelte|next\.?js|frontend|ui|component|css|tailwind)\b/i,
  backend: /\b(api|server|node|express|fastapi|django|backend|microservice|graphql|rest)\b/i,
  database: /\b(database|postgres|mysql|mongodb|redis|sql|orm|prisma|drizzle|supabase)\b/i,
  auth: /\b(auth|login|oauth|jwt|session|security|permission)\b/i,
  devops: /\b(docker|kubernetes|ci\/cd|deploy|hosting|cloud|aws|vercel|railway)\b/i,
  ai: /\b(ai|machine learning|ml|llm|gpt|claude|openai|anthropic|embedding|vector)\b/i,
  testing: /\b(test|jest|vitest|cypress|playwright|e2e|unit test)\b/i,
  tooling: /\b(cli|tool|dev tool|vite|webpack|bundler|linter|formatter)\b/i,
  security: /\b(security|vulnerability|cve|exploit|patch|audit)\b/i,
  performance: /\b(performance|speed|optimize|cache|fast|benchmark)\b/i,
};

function detectCategories(text: string): string[] {
  const categories: string[] = [];

  for (const [category, pattern] of Object.entries(CATEGORY_PATTERNS)) {
    if (pattern.test(text)) {
      categories.push(category);
    }
  }

  return categories;
}

const TECH_KEYWORDS = [
  // Languages
  'typescript', 'javascript', 'python', 'rust', 'go', 'java', 'kotlin', 'swift',
  // Frontend
  'react', 'vue', 'angular', 'svelte', 'solid', 'nextjs', 'nuxt', 'remix',
  // Backend
  'node', 'deno', 'bun', 'express', 'fastify', 'hono', 'fastapi', 'django', 'flask',
  // Database
  'postgres', 'postgresql', 'mysql', 'mongodb', 'redis', 'supabase', 'prisma', 'drizzle',
  // Cloud
  'aws', 'gcp', 'azure', 'vercel', 'netlify', 'railway', 'fly',
  // Tools
  'docker', 'kubernetes', 'terraform', 'github', 'gitlab',
  // AI
  'openai', 'anthropic', 'claude', 'gpt', 'llm', 'langchain',
];

function detectTechnologies(text: string): string[] {
  const textLower = text.toLowerCase();
  return TECH_KEYWORDS.filter(tech => textLower.includes(tech));
}

const ECOSYSTEM_MAP: Record<string, string[]> = {
  npm: ['javascript', 'typescript', 'node', 'react', 'vue', 'angular', 'svelte', 'nextjs'],
  pip: ['python', 'django', 'flask', 'fastapi'],
  cargo: ['rust'],
  go: ['go', 'golang'],
  gems: ['ruby', 'rails'],
};

function detectEcosystems(technologies: string[]): string[] {
  const ecosystems: string[] = [];

  for (const [ecosystem, techs] of Object.entries(ECOSYSTEM_MAP)) {
    if (technologies.some(t => techs.includes(t.toLowerCase()))) {
      ecosystems.push(ecosystem);
    }
  }

  return [...new Set(ecosystems)];
}

// ============================================================
// CONTENT HASH
// ============================================================

function generateContentHash(title: string, url: string): string {
  const content = `${title.toLowerCase().trim()}|${url.toLowerCase().trim()}`;
  return createHash('sha256').update(content).digest('hex').slice(0, 16);
}

// ============================================================
// MAIN NORMALIZER
// ============================================================

const NORMALIZERS: Record<FeedSourceName, (raw: RawFeedItem) => FeedItem | null> = {
  hacker_news: normalizeHackerNews,
  hacker_news_show: normalizeHackerNews,
  github_trending: normalizeGitHubTrending,
  github_releases: normalizeGitHubRelease,
  npm_new_packages: normalizeNpmPackage,
  product_hunt: normalizeProductHunt,
  // Placeholder for other sources
  y_combinator_launches: (raw) => null, // TODO
  y_combinator_companies: (raw) => null, // TODO
  techcrunch: (raw) => null, // TODO
  pypi_new_packages: (raw) => null, // TODO
  thoughtworks_radar: (raw) => null, // TODO
  javascript_weekly: (raw) => null, // TODO
  python_weekly: (raw) => null, // TODO
  changelog: (raw) => null, // TODO
  tldr_newsletter: (raw) => null, // TODO
  a16z_blog: (raw) => null, // TODO
  sequoia_blog: (raw) => null, // TODO
  stratechery: (raw) => null, // TODO
  the_information: (raw) => null, // TODO
  lobsters: (raw) => null, // TODO
  reddit_programming: (raw) => null, // TODO
  reddit_webdev: (raw) => null, // TODO
  reddit_node: (raw) => null, // TODO
  reddit_python: (raw) => null, // TODO
  dev_to: (raw) => null, // TODO
  this_week_in_rust: (raw) => null, // TODO
  go_weekly: (raw) => null, // TODO
  react_newsletter: (raw) => null, // TODO
  supabase_blog: (raw) => null, // TODO
  vercel_blog: (raw) => null, // TODO
};

/**
 * Normalize a raw feed item into the unified FeedItem format.
 */
export function normalizeItem(raw: RawFeedItem): FeedItem | null {
  const normalizer = NORMALIZERS[raw.sourceName];
  if (!normalizer) {
    logger.warn('No normalizer for source', { source: raw.sourceName });
    return null;
  }

  try {
    return normalizer(raw);
  } catch (error) {
    logger.error('Normalization failed', {
      source: raw.sourceName,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Normalize multiple raw items.
 */
export function normalizeItems(rawItems: RawFeedItem[]): FeedItem[] {
  const items: FeedItem[] = [];

  for (const raw of rawItems) {
    const normalized = normalizeItem(raw);
    if (normalized) {
      items.push(normalized);
    }
  }

  return items;
}

/**
 * Get source metadata for a feed item.
 */
export function getSourceMetadata(sourceName: FeedSourceName): {
  tier: FeedSourceTier;
  reliability: KQRReliability;
} | null {
  const source = getSource(sourceName);
  if (!source) return null;

  return {
    tier: source.tier,
    reliability: source.reliability,
  };
}
