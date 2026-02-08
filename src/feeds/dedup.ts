/**
 * TechScout — Feed Deduplication
 *
 * Deduplicates feed items to prevent processing the same content twice.
 * Uses content hashing and URL matching.
 */

import { nanoid } from 'nanoid';
import type { FeedItem } from '../types';
import { getFeedItemByContentHash, createFeedItem } from '../db/queries';
import { logger } from '../lib/logger';

/**
 * Result of deduplication process.
 */
export interface DedupResult {
  newItems: FeedItem[];
  duplicateCount: number;
  totalProcessed: number;
}

/**
 * Check if an item already exists in the database.
 */
async function itemExists(item: FeedItem): Promise<boolean> {
  if (!item.contentHash) return false;

  try {
    const existing = await getFeedItemByContentHash(item.contentHash);
    return existing !== null;
  } catch (error) {
    // If DB check fails, assume item doesn't exist
    logger.warn('DB check failed, assuming item is new', {
      contentHash: item.contentHash,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

/**
 * Deduplicate items against the database.
 * Returns only new items that don't exist in the database.
 */
export async function deduplicateAgainstDb(items: FeedItem[]): Promise<DedupResult> {
  const newItems: FeedItem[] = [];
  let duplicateCount = 0;

  for (const item of items) {
    const exists = await itemExists(item);

    if (exists) {
      duplicateCount++;
    } else {
      // Assign a new ID
      newItems.push({
        ...item,
        id: nanoid(),
      });
    }
  }

  return {
    newItems,
    duplicateCount,
    totalProcessed: items.length,
  };
}

/**
 * Deduplicate items within a batch (in-memory).
 * Removes duplicates based on content hash.
 */
export function deduplicateInMemory(items: FeedItem[]): DedupResult {
  const seen = new Map<string, FeedItem>();
  const seenUrls = new Set<string>();

  for (const item of items) {
    // Check by content hash
    if (item.contentHash && seen.has(item.contentHash)) {
      continue;
    }

    // Check by URL (fallback)
    if (item.url && seenUrls.has(item.url)) {
      continue;
    }

    if (item.contentHash) {
      seen.set(item.contentHash, item);
    }
    if (item.url) {
      seenUrls.add(item.url);
    }
  }

  const newItems = Array.from(seen.values()).map(item => ({
    ...item,
    id: item.id || nanoid(),
  }));

  return {
    newItems,
    duplicateCount: items.length - newItems.length,
    totalProcessed: items.length,
  };
}

/**
 * Full deduplication: first in-memory, then against database.
 */
export async function deduplicate(items: FeedItem[]): Promise<DedupResult> {
  // First pass: in-memory dedup
  const memoryResult = deduplicateInMemory(items);

  logger.debug('In-memory dedup completed', {
    total: memoryResult.totalProcessed,
    duplicates: memoryResult.duplicateCount,
    remaining: memoryResult.newItems.length,
  });

  // Second pass: database dedup
  const dbResult = await deduplicateAgainstDb(memoryResult.newItems);

  logger.info('Deduplication completed', {
    total: items.length,
    memoryDuplicates: memoryResult.duplicateCount,
    dbDuplicates: dbResult.duplicateCount,
    newItems: dbResult.newItems.length,
  });

  return {
    newItems: dbResult.newItems,
    duplicateCount: memoryResult.duplicateCount + dbResult.duplicateCount,
    totalProcessed: items.length,
  };
}

/**
 * Store new items in the database.
 */
export async function storeNewItems(items: FeedItem[]): Promise<{
  stored: number;
  failed: number;
}> {
  let stored = 0;
  let failed = 0;

  for (const item of items) {
    try {
      await createFeedItem({
        sourceName: item.sourceName,
        sourceTier: item.sourceTier,
        sourceReliability: item.sourceReliability,
        externalId: item.externalId,
        title: item.title,
        url: item.url,
        description: item.description,
        contentSummary: item.contentSummary,
        publishedAt: item.publishedAt,
        categories: item.categories,
        technologies: item.technologies,
        languageEcosystems: item.languageEcosystems,
        traction: item.traction as Record<string, unknown>,
        contentHash: item.contentHash,
      });
      stored++;
    } catch (error) {
      logger.warn('Failed to store feed item', {
        title: item.title,
        error: error instanceof Error ? error.message : String(error),
      });
      failed++;
    }
  }

  logger.info('Feed items stored', { stored, failed });

  return { stored, failed };
}

/**
 * Merge traction signals when the same item is found from multiple sources.
 */
export function mergeTractionSignals(
  existing: FeedItem,
  incoming: FeedItem
): FeedItem {
  return {
    ...existing,
    traction: {
      ...existing.traction,
      ...incoming.traction,
      // Prefer higher values for common signals
      points: Math.max(
        existing.traction.points ?? 0,
        incoming.traction.points ?? 0
      ),
      comments: Math.max(
        existing.traction.comments ?? 0,
        incoming.traction.comments ?? 0
      ),
    },
    // Merge technologies and categories
    technologies: [...new Set([...existing.technologies, ...incoming.technologies])],
    categories: [...new Set([...existing.categories, ...incoming.categories])],
  };
}

/**
 * Calculate similarity score between two items.
 * Used for fuzzy deduplication.
 */
export function calculateSimilarity(a: FeedItem, b: FeedItem): number {
  let score = 0;
  let maxScore = 0;

  // URL match (high weight)
  maxScore += 40;
  if (a.url && b.url && normalizeUrl(a.url) === normalizeUrl(b.url)) {
    score += 40;
  }

  // Title similarity (medium weight)
  maxScore += 30;
  const titleSimilarity = calculateTextSimilarity(
    a.title.toLowerCase(),
    b.title.toLowerCase()
  );
  score += titleSimilarity * 30;

  // External ID match (high weight)
  maxScore += 20;
  if (a.externalId && b.externalId && a.externalId === b.externalId) {
    score += 20;
  }

  // Content hash match (definitive)
  maxScore += 10;
  if (a.contentHash && b.contentHash && a.contentHash === b.contentHash) {
    score += 10;
  }

  return score / maxScore;
}

/**
 * Normalize URL for comparison.
 */
function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    // Remove trailing slashes, www, and common tracking params
    let normalized = `${parsed.hostname.replace(/^www\./, '')}${parsed.pathname}`;
    normalized = normalized.replace(/\/$/, '');
    return normalized.toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

/**
 * Calculate Jaccard similarity between two strings.
 */
function calculateTextSimilarity(a: string, b: string): number {
  const wordsA = new Set(a.split(/\s+/).filter(w => w.length > 2));
  const wordsB = new Set(b.split(/\s+/).filter(w => w.length > 2));

  if (wordsA.size === 0 && wordsB.size === 0) return 1;
  if (wordsA.size === 0 || wordsB.size === 0) return 0;

  const intersection = new Set([...wordsA].filter(x => wordsB.has(x)));
  const union = new Set([...wordsA, ...wordsB]);

  return intersection.size / union.size;
}

/**
 * Find potential duplicates in a batch using fuzzy matching.
 * Returns groups of similar items.
 */
export function findSimilarItems(
  items: FeedItem[],
  threshold: number = 0.7
): FeedItem[][] {
  const groups: FeedItem[][] = [];
  const assigned = new Set<number>();

  for (let i = 0; i < items.length; i++) {
    if (assigned.has(i)) continue;

    const group = [items[i]];
    assigned.add(i);

    for (let j = i + 1; j < items.length; j++) {
      if (assigned.has(j)) continue;

      const similarity = calculateSimilarity(items[i], items[j]);
      if (similarity >= threshold) {
        group.push(items[j]);
        assigned.add(j);
      }
    }

    if (group.length > 1) {
      groups.push(group);
    }
  }

  return groups;
}
