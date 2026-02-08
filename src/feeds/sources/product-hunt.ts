/**
 * TechScout — Product Hunt Feed Source
 *
 * Fetches trending developer tools from Product Hunt.
 * Uses the Product Hunt API (requires API key).
 *
 * Tier 1: High Signal
 * Reliability: High
 */

import { FeedSource, registerSource } from '../base';
import type { RawFeedItem, FeedSourceName, FeedSourceTier, KQRReliability } from '../../types';

interface PHPost {
  id: string;
  name: string;
  tagline: string;
  description: string;
  url: string;
  votesCount: number;
  commentsCount: number;
  createdAt: string;
  topics: Array<{ name: string }>;
  thumbnail?: { url: string };
  website: string;
}

/**
 * Product Hunt Developer Tools feed.
 * Filters for developer-focused products.
 */
export class ProductHuntSource extends FeedSource {
  readonly name: FeedSourceName = 'product_hunt';
  readonly tier: FeedSourceTier = 'tier1_high_signal';
  readonly reliability: KQRReliability = 'high';
  readonly fetchMethod = 'graphql' as const;
  readonly frequency = 'daily' as const;

  private readonly minVotes: number;
  private readonly maxItems: number;
  private readonly devTopics: string[];

  constructor(options: {
    minVotes?: number;
    maxItems?: number;
  } = {}) {
    super();
    this.minVotes = options.minVotes ?? 50;
    this.maxItems = options.maxItems ?? 20;
    this.devTopics = [
      'Developer Tools',
      'Open Source',
      'Productivity',
      'API',
      'No-Code',
      'Artificial Intelligence',
      'SaaS',
      'Tech',
      'GitHub',
      'Web Development',
    ];
  }

  async fetch(): Promise<RawFeedItem[]> {
    const apiKey = process.env.PRODUCT_HUNT_API_KEY;

    // If no API key, return empty (Product Hunt API requires auth)
    if (!apiKey) {
      this.logger.warn('PRODUCT_HUNT_API_KEY not set, skipping');
      return [];
    }

    try {
      const posts = await this.fetchPosts(apiKey);

      // Filter for dev-related products
      const devPosts = posts.filter(post =>
        post.votesCount >= this.minVotes &&
        post.topics.some(t => this.devTopics.includes(t.name))
      );

      return devPosts.slice(0, this.maxItems).map(post => ({
        sourceName: this.name,
        fetchedAt: new Date().toISOString(),
        rawData: post,
      }));
    } catch (error) {
      // Fallback: return empty if API fails
      this.logger.warn('Product Hunt API failed, using fallback', {
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  private async fetchPosts(apiKey: string): Promise<PHPost[]> {
    const query = `
      query {
        posts(first: 50, order: VOTES) {
          edges {
            node {
              id
              name
              tagline
              description
              url
              votesCount
              commentsCount
              createdAt
              website
              topics {
                edges {
                  node {
                    name
                  }
                }
              }
              thumbnail {
                url
              }
            }
          }
        }
      }
    `;

    const res = await fetch('https://api.producthunt.com/v2/api/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ query }),
    });

    if (!res.ok) {
      throw new Error(`Product Hunt API error: ${res.status}`);
    }

    const data = (await res.json()) as {
      errors?: Array<{ message: string }>;
      data: {
        posts: {
          edges: Array<{
            node: {
              id: string;
              name: string;
              tagline: string;
              description: string;
              url: string;
              votesCount: number;
              commentsCount: number;
              createdAt: string;
              website: string;
              topics: { edges: Array<{ node: { name: string } }> };
              thumbnail?: { url: string };
            };
          }>;
        };
      };
    };

    if (data.errors) {
      throw new Error(`GraphQL error: ${data.errors[0]?.message}`);
    }

    return data.data.posts.edges.map(edge => ({
      id: edge.node.id,
      name: edge.node.name,
      tagline: edge.node.tagline,
      description: edge.node.description,
      url: edge.node.url,
      votesCount: edge.node.votesCount,
      commentsCount: edge.node.commentsCount,
      createdAt: edge.node.createdAt,
      website: edge.node.website,
      topics: edge.node.topics.edges.map(t => ({ name: t.node.name })),
      thumbnail: edge.node.thumbnail,
    }));
  }
}

// Register source
registerSource(new ProductHuntSource());
