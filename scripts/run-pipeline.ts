/**
 * TechScout — Run Pipeline Script
 *
 * Executes the full scouting pipeline for a project:
 * L2 Feeds → L3 Matching → L4 Delivery
 *
 * Usage:
 *   npm run pipeline                     # Uses default seeded project
 *   npm run pipeline -- --project <id>   # Specific project
 *   npm run pipeline -- --dry-run        # Don't save to DB
 */

import 'dotenv/config';
import { logger } from '../src/lib/logger';
import { getAdminClient } from '../src/db/client';
import { getProject, getFeedItems, createRecommendation } from '../src/db/queries';

// L2 Feeds
import { HackerNewsSource } from '../src/feeds/sources/hacker-news';
import { GitHubTrendingSource } from '../src/feeds/sources/github-trending';
import { normalizeItems } from '../src/feeds/normalizer';
import { deduplicateInMemory } from '../src/feeds/dedup';
import { nanoid } from 'nanoid';

// L3 Matching
import { preFilterBatch } from '../src/matching/prefilter';
import { evaluateMaturityBatch } from '../src/matching/maturity';
import { runMatchingPipeline } from '../src/matching';

// L4 Delivery
import { generateTechnicalBrief, renderTechnicalBriefMarkdown } from '../src/delivery/technical-brief';
import { generateHumanBrief, renderHumanBriefMarkdown } from '../src/delivery/human-brief';

// Types
import type { ProjectProfile, FeedItem, Recommendation } from '../src/types';

// ============================================================
// CONFIGURATION
// ============================================================

interface PipelineOptions {
  projectId?: string;
  dryRun: boolean;
  maxFeedItems: number;
  maxRecommendations: number;
  skipFetch: boolean;
}

function parseArgs(): PipelineOptions {
  const args = process.argv.slice(2);
  const options: PipelineOptions = {
    dryRun: false,
    maxFeedItems: 50,
    maxRecommendations: 10,
    skipFetch: false,
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--project' && args[i + 1]) {
      options.projectId = args[i + 1];
      i++;
    } else if (args[i] === '--dry-run') {
      options.dryRun = true;
    } else if (args[i] === '--skip-fetch') {
      options.skipFetch = true;
    } else if (args[i] === '--max-items' && args[i + 1]) {
      options.maxFeedItems = parseInt(args[i + 1]);
      i++;
    }
  }

  return options;
}

// ============================================================
// PIPELINE STAGES
// ============================================================

/**
 * Stage 1: Load project profile
 */
async function loadProject(projectId?: string): Promise<ProjectProfile | null> {
  logger.info('Loading project profile...');

  const admin = getAdminClient();

  if (projectId) {
    const { data, error } = await admin
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .single();

    if (error || !data) {
      logger.error('Project not found', { projectId, error: error?.message });
      return null;
    }

    return data as unknown as ProjectProfile;
  }

  // Get first project if no ID specified
  const { data, error } = await admin
    .from('projects')
    .select('*')
    .limit(1)
    .single();

  if (error || !data) {
    logger.error('No projects found', { error: error?.message });
    return null;
  }

  return data as unknown as ProjectProfile;
}

/**
 * Stage 2: Fetch feed items
 */
async function fetchFeeds(maxItems: number): Promise<FeedItem[]> {
  logger.info('Fetching feed items...', { maxItems });

  const allItems: FeedItem[] = [];

  // Fetch from Hacker News
  try {
    const hnSource = new HackerNewsSource({ maxItems: Math.floor(maxItems / 2) });
    const hnRaw = await hnSource.fetch();
    const hnNormalized = normalizeItems(hnRaw);
    allItems.push(...hnNormalized);
    logger.info('HackerNews fetched', { count: hnNormalized.length });
  } catch (error) {
    logger.warn('HackerNews fetch failed', { error: error instanceof Error ? error.message : String(error) });
  }

  // Fetch from GitHub Trending
  try {
    const ghSource = new GitHubTrendingSource({ maxItems: Math.floor(maxItems / 2) });
    const ghRaw = await ghSource.fetch();
    const ghNormalized = normalizeItems(ghRaw);
    allItems.push(...ghNormalized);
    logger.info('GitHub Trending fetched', { count: ghNormalized.length });
  } catch (error) {
    logger.warn('GitHub Trending fetch failed', { error: error instanceof Error ? error.message : String(error) });
  }

  // Assign IDs and deduplicate
  for (const item of allItems) {
    if (!item.id) {
      item.id = nanoid();
    }
  }

  const dedupResult = deduplicateInMemory(allItems);
  logger.info('Feed items deduplicated', { before: allItems.length, after: dedupResult.newItems.length });

  return dedupResult.newItems;
}

/**
 * Stage 3: Load existing feed items from database
 */
async function loadFeedItemsFromDB(limit: number): Promise<FeedItem[]> {
  logger.info('Loading feed items from database...', { limit });

  const admin = getAdminClient();
  const { data, error } = await admin
    .from('feed_items')
    .select('*')
    .eq('is_processed', false)
    .order('published_at', { ascending: false })
    .limit(limit);

  if (error) {
    logger.error('Failed to load feed items', { error: error.message });
    return [];
  }

  // Convert DB format to FeedItem
  const items: FeedItem[] = (data || []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    sourceName: row.source_name as FeedItem['sourceName'],
    sourceTier: row.source_tier as FeedItem['sourceTier'],
    sourceReliability: row.source_reliability as FeedItem['sourceReliability'],
    externalId: row.external_id as string,
    title: row.title as string,
    url: row.url as string,
    description: row.description as string | undefined,
    publishedAt: row.published_at as string,
    fetchedAt: row.fetched_at as string,
    categories: row.categories as string[],
    technologies: row.technologies as string[],
    languageEcosystems: row.language_ecosystems as string[],
    traction: row.traction as FeedItem['traction'],
    isProcessed: row.is_processed as boolean,
    contentHash: row.content_hash as string,
  }));

  logger.info('Feed items loaded from DB', { count: items.length });
  return items;
}

/**
 * Stage 4: Run matching pipeline
 */
async function runMatching(
  project: ProjectProfile,
  feedItems: FeedItem[],
  maxRecommendations: number
): Promise<Recommendation[]> {
  const projectId = (project as Record<string, unknown>).id as string;
  const projectName = (project as Record<string, unknown>).name as string || 'Unknown';

  logger.info('Running matching pipeline...', {
    projectId,
    feedItems: feedItems.length,
    maxRecommendations,
  });

  // Build profile structure expected by matching pipeline
  const profileForMatching = {
    project: {
      id: projectId,
      name: projectName,
      slug: (project as Record<string, unknown>).slug as string || 'unknown',
    },
    stack: {
      languages: [{ name: 'typescript' }, { name: 'javascript' }],
      frameworks: [{ name: 'node' }, { name: 'react' }, { name: 'express' }],
      databases: [{ name: 'postgresql' }, { name: 'supabase' }],
      keyDependencies: [{ name: 'zod' }, { name: 'vitest' }],
      allDependencies: { npm: [], pip: [] },
      infrastructure: [],
      devTools: [],
    },
    stackHealth: {
      overallScore: 0.75,
      components: {
        security: { score: 0.8, details: [] },
        freshness: { score: 0.7, details: [] },
        maintenance: { score: 0.75, details: [] },
        complexity: { score: 0.75, details: [] },
      },
    },
    manifest: {
      objectives: ['Improve performance', 'Enhance developer experience'],
      painPoints: ['Slow build times', 'Complex configuration'],
      constraints: ['Must maintain backwards compatibility'],
    },
    cfFindings: {
      findings: [],
      analyzedAt: new Date().toISOString(),
    },
    teamRoles: ['developer_fullstack', 'pm'] as const,
    scouting: {
      enabled: true,
      focusAreas: ['frontend', 'backend', 'devops', 'tooling', 'ai', 'database'],
      excludeCategories: [],
      maturityFilter: 'early_adopter' as const,
      maxRecommendations: maxRecommendations,
    },
  };

  try {
    // Note: runMatchingPipeline expects (items, profile, config)
    const result = await runMatchingPipeline(feedItems, profileForMatching as unknown as ProjectProfile);
    logger.info('Matching complete', { recommendations: result.recommendations.length });
    return result.recommendations;
  } catch (error) {
    logger.error('Matching failed', { error: error instanceof Error ? error.message : String(error) });
    return [];
  }
}

/**
 * Stage 5: Generate and display briefs
 */
function generateBriefs(
  project: ProjectProfile,
  recommendations: Recommendation[]
): void {
  if (recommendations.length === 0) {
    logger.info('No recommendations to generate briefs for');
    return;
  }

  logger.info('Generating briefs...', { recommendations: recommendations.length });

  // Generate technical brief
  const technicalBrief = generateTechnicalBrief(
    project.id,
    (project as Record<string, unknown>).name as string || 'Project',
    recommendations
  );

  // Generate human brief
  const humanBrief = generateHumanBrief(
    project.id,
    (project as Record<string, unknown>).name as string || 'Project',
    recommendations
  );

  // Output briefs
  console.log('\n' + '='.repeat(60));
  console.log('TECHNICAL BRIEF');
  console.log('='.repeat(60));
  console.log(renderTechnicalBriefMarkdown(technicalBrief));

  console.log('\n' + '='.repeat(60));
  console.log('HUMAN BRIEF');
  console.log('='.repeat(60));
  console.log(renderHumanBriefMarkdown(humanBrief));
}

/**
 * Stage 6: Save recommendations to database
 */
async function saveRecommendations(
  recommendations: Recommendation[],
  dryRun: boolean
): Promise<void> {
  if (dryRun) {
    logger.info('Dry run - skipping database save', { count: recommendations.length });
    return;
  }

  logger.info('Saving recommendations to database...', { count: recommendations.length });

  for (const rec of recommendations) {
    try {
      await createRecommendation({
        projectId: rec.projectId,
        feedItemId: rec.feedItemId,
        type: 'recommendation',
        action: rec.action,
        priority: rec.priority,
        confidence: rec.confidence,
        subject: rec.subject,
        relevance: rec.relevance,
        technical: rec.technical,
        stabilityAssessment: rec.stabilityAssessment,
        ifxTraceId: rec.ifxTraceId,
        roleVisibility: rec.roleVisibility,
        status: 'active',
        expiresAt: rec.expiresAt,
      });
    } catch (error) {
      logger.warn('Failed to save recommendation', {
        id: rec.id,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  logger.info('Recommendations saved');
}

// ============================================================
// MAIN
// ============================================================

async function runPipeline() {
  const options = parseArgs();

  console.log('\n' + '='.repeat(60));
  console.log('TECHSCOUT PIPELINE');
  console.log('='.repeat(60));
  console.log(`Dry Run: ${options.dryRun}`);
  console.log(`Max Feed Items: ${options.maxFeedItems}`);
  console.log(`Max Recommendations: ${options.maxRecommendations}`);
  console.log('='.repeat(60) + '\n');

  const startTime = Date.now();

  try {
    // Stage 1: Load project
    const project = await loadProject(options.projectId);
    if (!project) {
      console.error('No project found. Run `npm run seed` first.');
      process.exit(1);
    }
    logger.info('Project loaded', { id: project.id, name: (project as Record<string, unknown>).name });

    // Stage 2: Get feed items
    let feedItems: FeedItem[];
    if (options.skipFetch) {
      feedItems = await loadFeedItemsFromDB(options.maxFeedItems);
    } else {
      feedItems = await fetchFeeds(options.maxFeedItems);
    }

    if (feedItems.length === 0) {
      console.log('\nNo feed items to process.');
      console.log('Run with live fetch or seed feed items first.');
      process.exit(0);
    }

    // Stage 3: Run matching
    const recommendations = await runMatching(project, feedItems, options.maxRecommendations);

    // Stage 4: Generate briefs
    generateBriefs(project, recommendations);

    // Stage 5: Save to database
    await saveRecommendations(recommendations, options.dryRun);

    // Summary
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log('\n' + '='.repeat(60));
    console.log('PIPELINE COMPLETE');
    console.log('='.repeat(60));
    console.log(`Duration: ${duration}s`);
    console.log(`Feed items processed: ${feedItems.length}`);
    console.log(`Recommendations generated: ${recommendations.length}`);
    console.log('='.repeat(60) + '\n');

  } catch (error) {
    logger.error('Pipeline failed', { error: error instanceof Error ? error.message : String(error) });
    console.error('\nPipeline failed:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

runPipeline();
