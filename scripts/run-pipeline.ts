/**
 * TechScout — Run Pipeline Script
 *
 * Executes the full scouting pipeline for a project:
 * L2 Feeds → L3 Matching → L4 Delivery
 *
 * Usage:
 *   npm run pipeline                              # Uses default seeded project
 *   npm run pipeline -- --project <id>            # Specific project
 *   npm run pipeline -- --dry-run                 # Don't save to DB
 *   npm run pipeline -- --send-email <addr>       # Send briefs to email
 *   npm run pipeline -- --email-role tech|human   # tech or human brief (email)
 *   npm run pipeline -- --send-slack #channel     # Send briefs to Slack channel
 *   npm run pipeline -- --slack-role tech|human   # tech or human brief (Slack)
 */

import 'dotenv/config';
import { logger } from '../src/lib/logger';
import { getAdminClient } from '../src/db/client';
import { createRecommendation, createFeedItem } from '../src/db/queries';

// L2 Feeds
import { HackerNewsSource } from '../src/feeds/sources/hacker-news';
import { GitHubTrendingSource } from '../src/feeds/sources/github-trending';
import { normalizeItems } from '../src/feeds/normalizer';
import { deduplicateInMemory } from '../src/feeds/dedup';
import { randomUUID } from 'crypto';

// L3 Matching
import { preFilterBatch } from '../src/matching/prefilter';
import { evaluateMaturityBatch } from '../src/matching/maturity';
import { runMatchingPipeline } from '../src/matching';
import {
  detectBreakingChanges,
  renderAlertsMarkdown,
  formatAlertsForDelivery,
} from '../src/matching/breaking-change';

// L4 Delivery
import { generateTechnicalBrief, renderTechnicalBriefMarkdown } from '../src/delivery/technical-brief';
import { generateHumanBrief, renderHumanBriefMarkdown } from '../src/delivery/human-brief';
import {
  deliverTechnicalBrief,
  deliverHumanBrief,
  sendBreakingChangeAlerts,
} from '../src/delivery/email';
import {
  deliverTechnicalBriefToSlack,
  deliverHumanBriefToSlack,
  sendBreakingChangeAlertsToSlack,
} from '../src/delivery/slack';

// Types
import type { ProjectProfile, FeedItem, Recommendation, BreakingChangeAlert } from '../src/types';

// ============================================================
// CONFIGURATION
// ============================================================

interface PipelineOptions {
  projectId?: string;
  dryRun: boolean;
  maxFeedItems: number;
  maxRecommendations: number;
  skipFetch: boolean;
  skipBreakingChange: boolean;
  sendEmail?: string;
  emailRole: 'technical' | 'human';
  sendSlack?: string; // Channel name (e.g., '#techscout')
  slackRole: 'technical' | 'human';
}

function parseArgs(): PipelineOptions {
  const args = process.argv.slice(2);
  const options: PipelineOptions = {
    dryRun: false,
    maxFeedItems: 50,
    maxRecommendations: 10,
    skipFetch: false,
    skipBreakingChange: false,
    emailRole: 'technical',
    slackRole: 'technical',
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--project' && args[i + 1]) {
      options.projectId = args[i + 1];
      i++;
    } else if (args[i] === '--dry-run') {
      options.dryRun = true;
    } else if (args[i] === '--skip-fetch') {
      options.skipFetch = true;
    } else if (args[i] === '--skip-breaking-change') {
      options.skipBreakingChange = true;
    } else if (args[i] === '--max-items' && args[i + 1]) {
      options.maxFeedItems = parseInt(args[i + 1]);
      i++;
    } else if (args[i] === '--send-email' && args[i + 1]) {
      options.sendEmail = args[i + 1];
      i++;
    } else if (args[i] === '--email-role' && args[i + 1]) {
      options.emailRole = args[i + 1] === 'human' ? 'human' : 'technical';
      i++;
    } else if (args[i] === '--send-slack' && args[i + 1]) {
      options.sendSlack = args[i + 1];
      i++;
    } else if (args[i] === '--slack-role' && args[i + 1]) {
      options.slackRole = args[i + 1] === 'human' ? 'human' : 'technical';
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
      item.id = randomUUID();
    }
  }

  const dedupResult = deduplicateInMemory(allItems);
  logger.info('Feed items deduplicated', { before: allItems.length, after: dedupResult.newItems.length });

  return dedupResult.newItems;
}

/**
 * Stage 2b: Persist feed items to database (get-or-create pattern)
 */
async function persistFeedItems(items: FeedItem[]): Promise<FeedItem[]> {
  logger.info('Persisting feed items to database...', { count: items.length });

  const admin = getAdminClient();
  const persistedItems: FeedItem[] = [];
  let created = 0;
  let existing = 0;
  let failed = 0;

  for (const item of items) {
    try {
      // Try to insert the item
      const result = await createFeedItem({
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

      // Use the DB-assigned ID for the item
      persistedItems.push({
        ...item,
        id: result.id,
      });
      created++;
    } catch (error) {
      // Check if it's a duplicate key error (23505)
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('23505') || errorMessage.includes('duplicate key')) {
        // Item already exists - look it up by source_name + external_id
        try {
          const { data: existingItem } = await admin
            .from('feed_items')
            .select('id')
            .eq('source_name', item.sourceName)
            .eq('external_id', item.externalId)
            .single();

          if (existingItem) {
            persistedItems.push({
              ...item,
              id: existingItem.id,
            });
            existing++;
            continue;
          }
        } catch {
          // Lookup failed
        }
      }

      logger.warn('Failed to persist feed item', {
        title: item.title,
        error: errorMessage,
      });
      failed++;
    }
  }

  logger.info('Feed items persisted', { created, existing, failed, total: persistedItems.length });
  return persistedItems;
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

  // Load real data from database (using admin client to bypass RLS)
  const admin = getAdminClient();

  const [manifestResult, cfFindingsResult, stackHealthResult, stackResult] = await Promise.all([
    admin.from('project_manifest').select('*').eq('project_id', projectId).single(),
    admin.from('cf_findings').select('*').eq('project_id', projectId).eq('is_resolved', false),
    admin.from('stack_health').select('*').eq('project_id', projectId).single(),
    admin.from('project_stack').select('*').eq('project_id', projectId).single(),
  ]);

  const manifest = manifestResult.data;
  const cfFindings = cfFindingsResult.data || [];
  const stackHealth = stackHealthResult.data;
  const stack = stackResult.data;

  logger.info('Loaded project data', {
    hasManifest: !!manifest,
    cfFindings: cfFindings.length,
    hasStackHealth: !!stackHealth,
    hasStack: !!stack,
    painPoints: manifest?.pain_points?.length ?? 0,
  });

  // Build profile structure expected by matching pipeline
  const profileForMatching = {
    project: {
      id: projectId,
      name: projectName,
      slug: (project as Record<string, unknown>).slug as string || 'unknown',
    },
    stack: {
      languages: (stack?.languages || []).map((l: { name: string }) => ({ name: l.name.toLowerCase() })),
      frameworks: (stack?.frameworks || []).map((f: { name: string }) => ({ name: f.name.toLowerCase() })),
      databases: (stack?.databases || []).map((d: { name: string }) => ({ name: d.name.toLowerCase() })),
      keyDependencies: (stack?.key_dependencies || []).map((k: { name: string }) => ({ name: k.name.toLowerCase() })),
      allDependencies: stack?.all_dependencies || { npm: [], pip: [] },
      infrastructure: [],
      devTools: [],
    },
    stackHealth: {
      overallScore: stackHealth?.overall_score ?? 0.75,
      components: {
        security: { score: stackHealth?.components?.security?.score ?? 0.8, details: [] },
        freshness: { score: stackHealth?.components?.freshness?.score ?? 0.7, details: [] },
        maintenance: { score: stackHealth?.components?.maintenanceRisk?.score ?? 0.75, details: [] },
        complexity: { score: stackHealth?.components?.complexity?.score ?? 0.75, details: [] },
      },
    },
    manifest: {
      objectives: manifest?.objectives || [],
      painPoints: manifest?.pain_points || [],
      constraints: manifest?.constraints || [],
    },
    cfFindings: {
      findings: cfFindings.map(f => ({
        id: f.finding_id,
        severity: f.severity,
        category: f.category,
        description: f.description,
      })),
      analyzedAt: cfFindings[0]?.scanned_at || new Date().toISOString(),
    },
    teamRoles: ['developer_fullstack', 'pm'] as const,
    scouting: {
      enabled: true,
      focusAreas: (project as Record<string, unknown>).focus_areas as string[] || ['frontend', 'backend', 'devops', 'tooling', 'ai', 'database', 'security'],
      excludeCategories: (project as Record<string, unknown>).exclude_categories as string[] || [],
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

  const projectId = (project as Record<string, unknown>).id as string || 'unknown';
  const projectName = (project as Record<string, unknown>).name as string || 'Unknown Project';

  // Generate technical brief
  const technicalBrief = generateTechnicalBrief(
    projectId,
    recommendations
  );

  // Generate human brief
  const humanBrief = generateHumanBrief(
    projectId,
    projectName,
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
        ifxTraceId: rec.ifxTraceId,
        modelUsed: rec.modelUsed,
        type: rec.type,
        action: rec.action,
        priority: rec.priority,
        confidence: rec.confidence,
        subject: rec.subject as Record<string, unknown>,
        replaces: rec.replaces,
        complements: rec.complements,
        enables: rec.enables,
        roleVisibility: rec.roleVisibility,
        stabilityAssessment: rec.stabilityAssessment as Record<string, unknown>,
        technical: rec.technical as Record<string, unknown>,
        humanFriendly: rec.humanFriendly as Record<string, unknown>,
        kqr: rec.kqr as Record<string, unknown>,
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
  console.log(`Breaking Change Detection: ${!options.skipBreakingChange}`);
  console.log(`Email Delivery: ${options.sendEmail || 'disabled'}`);
  if (options.sendEmail) {
    console.log(`Email Role: ${options.emailRole}`);
  }
  console.log(`Slack Delivery: ${options.sendSlack || 'disabled'}`);
  if (options.sendSlack) {
    console.log(`Slack Role: ${options.slackRole}`);
  }
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

      // Persist fetched items to DB so recommendations can reference them
      if (!options.dryRun && feedItems.length > 0) {
        feedItems = await persistFeedItems(feedItems);
      }
    }

    if (feedItems.length === 0) {
      console.log('\nNo feed items to process.');
      console.log('Run with live fetch or seed feed items first.');
      process.exit(0);
    }

    // Stage 3: Breaking Change Detection (runs in parallel conceptually, bypasses stability gate)
    let breakingChangeAlerts: BreakingChangeAlert[] = [];
    if (!options.skipBreakingChange) {
      logger.info('Running breaking change detection...');

      // Build profile structure for breaking change detection
      const projectId = (project as Record<string, unknown>).id as string;
      const projectName = (project as Record<string, unknown>).name as string || 'Unknown';
      const admin = getAdminClient();

      const stackResult = await admin.from('project_stack').select('*').eq('project_id', projectId).single();
      const stack = stackResult.data;

      const bcProfile: ProjectProfile = {
        project: {
          id: projectId,
          name: projectName,
          slug: (project as Record<string, unknown>).slug as string || 'unknown',
        },
        stack: {
          languages: (stack?.languages || []).map((l: { name: string; percentage?: number; role?: string }) => ({
            name: l.name.toLowerCase(),
            percentage: l.percentage || 0,
            role: l.role || 'secondary',
          })),
          frameworks: (stack?.frameworks || []).map((f: { name: string; version?: string }) => ({
            name: f.name.toLowerCase(),
            version: f.version,
          })),
          databases: (stack?.databases || []).map((d: { name: string; role?: string }) => ({
            name: d.name.toLowerCase(),
            role: d.role || 'primary',
          })),
          keyDependencies: (stack?.key_dependencies || []).map((k: { name: string; version?: string; ecosystem?: string }) => ({
            name: k.name.toLowerCase(),
            version: k.version || '0.0.0',
            ecosystem: (k.ecosystem || 'npm') as 'npm' | 'pip' | 'cargo' | 'go',
          })),
          allDependencies: stack?.all_dependencies || { npm: {}, pip: {} },
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
          objectives: [],
          painPoints: [],
          constraints: [],
        },
        cfFindings: {
          findings: [],
          analyzedAt: new Date().toISOString(),
        },
        teamRoles: ['developer_fullstack'],
        scouting: {
          enabled: true,
          focusAreas: ['frontend', 'backend'],
          excludeCategories: [],
          maturityFilter: 'early_adopter',
          maxRecommendations: 5,
        },
      };

      const bcResult = await detectBreakingChanges(bcProfile, {
        checkMajorVersions: true,
        checkSecurityAdvisories: true,
        checkEOL: true,
        maxDependencies: 30,
      });

      breakingChangeAlerts = bcResult.alerts;

      if (breakingChangeAlerts.length > 0) {
        console.log('\n' + '='.repeat(60));
        console.log('BREAKING CHANGE ALERTS');
        console.log('='.repeat(60));
        console.log(renderAlertsMarkdown(breakingChangeAlerts));

        const grouped = formatAlertsForDelivery(breakingChangeAlerts);
        logger.info('Breaking change detection completed', {
          total: breakingChangeAlerts.length,
          critical: grouped.critical.length,
          high: grouped.high.length,
          other: grouped.other.length,
        });
      } else {
        logger.info('No breaking changes detected');
      }
    }

    // Stage 4: Run matching
    const recommendations = await runMatching(project, feedItems, options.maxRecommendations);

    // Stage 5: Generate briefs
    generateBriefs(project, recommendations);

    // Stage 6: Save to database
    await saveRecommendations(recommendations, options.dryRun);

    // Stage 7: Email delivery (optional)
    let emailSent = false;
    if (options.sendEmail && recommendations.length > 0) {
      const projectId = (project as Record<string, unknown>).id as string;
      const projectName = (project as Record<string, unknown>).name as string || 'Unknown';

      logger.info('Sending email...', { to: options.sendEmail, role: options.emailRole });

      try {
        if (options.emailRole === 'technical') {
          const technicalBrief = generateTechnicalBrief(projectId, recommendations);
          const result = await deliverTechnicalBrief(
            technicalBrief,
            [{ email: options.sendEmail }]
          );
          emailSent = result.success;
          if (result.success) {
            logger.info('Technical brief email sent', { messageId: result.messageId });
          } else {
            logger.error('Email delivery failed', { error: result.error });
          }
        } else {
          const humanBrief = generateHumanBrief(projectId, projectName, recommendations);
          const result = await deliverHumanBrief(
            humanBrief,
            [{ email: options.sendEmail }]
          );
          emailSent = result.success;
          if (result.success) {
            logger.info('Human brief email sent', { messageId: result.messageId });
          } else {
            logger.error('Email delivery failed', { error: result.error });
          }
        }

        // Send breaking change alerts if any
        if (breakingChangeAlerts.length > 0) {
          const alertResult = await sendBreakingChangeAlerts(
            (project as Record<string, unknown>).name as string || 'Project',
            breakingChangeAlerts,
            [{ email: options.sendEmail }]
          );
          if (alertResult.success) {
            logger.info('Breaking change alert email sent', { messageId: alertResult.messageId });
          }
        }
      } catch (error) {
        logger.error('Email delivery error', { error: error instanceof Error ? error.message : String(error) });
      }
    }

    // Stage 8: Slack delivery (optional)
    let slackSent = false;
    if (options.sendSlack && recommendations.length > 0) {
      const projectId = (project as Record<string, unknown>).id as string;
      const projectName = (project as Record<string, unknown>).name as string || 'Unknown';

      logger.info('Sending to Slack...', { channel: options.sendSlack, role: options.slackRole });

      try {
        if (options.slackRole === 'technical') {
          const technicalBrief = generateTechnicalBrief(projectId, recommendations);
          const result = await deliverTechnicalBriefToSlack(
            technicalBrief,
            options.sendSlack
          );
          slackSent = result.success;
          if (result.success) {
            logger.info('Technical brief sent to Slack', { channel: result.channel, ts: result.ts });
          } else {
            logger.error('Slack delivery failed', { error: result.error });
          }
        } else {
          const humanBrief = generateHumanBrief(projectId, projectName, recommendations);
          const result = await deliverHumanBriefToSlack(
            humanBrief,
            options.sendSlack
          );
          slackSent = result.success;
          if (result.success) {
            logger.info('Human brief sent to Slack', { channel: result.channel, ts: result.ts });
          } else {
            logger.error('Slack delivery failed', { error: result.error });
          }
        }

        // Send breaking change alerts if any
        if (breakingChangeAlerts.length > 0) {
          const alertResult = await sendBreakingChangeAlertsToSlack(
            (project as Record<string, unknown>).name as string || 'Project',
            breakingChangeAlerts,
            options.sendSlack
          );
          if (alertResult.success) {
            logger.info('Breaking change alerts sent to Slack', { channel: alertResult.channel });
          }
        }
      } catch (error) {
        logger.error('Slack delivery error', { error: error instanceof Error ? error.message : String(error) });
      }
    }

    // Summary
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log('\n' + '='.repeat(60));
    console.log('PIPELINE COMPLETE');
    console.log('='.repeat(60));
    console.log(`Duration: ${duration}s`);
    console.log(`Feed items processed: ${feedItems.length}`);
    console.log(`Breaking change alerts: ${breakingChangeAlerts.length}`);
    console.log(`Recommendations generated: ${recommendations.length}`);
    if (options.sendEmail) {
      console.log(`Email sent: ${emailSent ? 'Yes' : 'No'}`);
    }
    if (options.sendSlack) {
      console.log(`Slack sent: ${slackSent ? 'Yes' : 'No'}`);
    }
    console.log('='.repeat(60) + '\n');

  } catch (error) {
    logger.error('Pipeline failed', { error: error instanceof Error ? error.message : String(error) });
    console.error('\nPipeline failed:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

runPipeline();
