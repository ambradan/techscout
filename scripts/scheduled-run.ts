/**
 * TechScout — Scheduled Run Script
 *
 * Executes the scouting pipeline for all enabled projects.
 * Designed to be called by an external cron job or workflow scheduler.
 *
 * Usage:
 *   npm run scheduled                    # Run for all enabled projects
 *   npm run scheduled -- --dry-run       # Preview without sending
 *
 * Cron Setup (runs daily at 6 AM):
 *   0 6 * * * cd /path/to/techscout && npm run scheduled >> /var/log/techscout.log 2>&1
 *
 * n8n Workflow:
 *   1. Create a Cron node with desired schedule
 *   2. Add Execute Command node with:
 *      - Command: npm run scheduled
 *      - Working Directory: /path/to/techscout
 *   3. Optionally add error notification nodes
 */

import 'dotenv/config';
import { logger } from '../src/lib/logger';
import { getAdminClient } from '../src/db/client';

// L2 Feeds
import { HackerNewsSource } from '../src/feeds/sources/hacker-news';
import { GitHubTrendingSource } from '../src/feeds/sources/github-trending';
import { normalizeItems } from '../src/feeds/normalizer';
import { deduplicateInMemory } from '../src/feeds/dedup';
import { randomUUID } from 'crypto';

// L3 Matching
import { runMatchingPipeline } from '../src/matching';
import { detectBreakingChanges, formatAlertsForDelivery } from '../src/matching/breaking-change';

// L4 Delivery
import { generateTechnicalBrief } from '../src/delivery/technical-brief';
import { generateHumanBrief } from '../src/delivery/human-brief';
import { deliverTechnicalBrief, deliverHumanBrief, sendBreakingChangeAlerts } from '../src/delivery/email';
import { deliverTechnicalBriefToSlack, deliverHumanBriefToSlack, sendBreakingChangeAlertsToSlack } from '../src/delivery/slack';
import { exportAndUploadTechnicalBriefPDF, exportAndUploadHumanBriefPDF } from '../src/delivery/export';

// Types
import type { ProjectProfile, FeedItem, Recommendation, BreakingChangeAlert } from '../src/types';

// ============================================================
// CONFIGURATION
// ============================================================

interface ScheduledOptions {
  dryRun: boolean;
  maxFeedItems: number;
  maxRecommendations: number;
}

interface ProjectDeliveryConfig {
  email?: {
    technical?: string[];
    human?: string[];
  };
  slack?: {
    technical?: string;
    human?: string;
  };
  exportPdf: boolean;
}

interface RunResult {
  projectId: string;
  projectName: string;
  success: boolean;
  recommendations: number;
  breakingAlerts: number;
  deliveries: {
    email: boolean;
    slack: boolean;
    pdf: boolean;
  };
  error?: string;
  durationMs: number;
}

function parseArgs(): ScheduledOptions {
  const args = process.argv.slice(2);
  return {
    dryRun: args.includes('--dry-run'),
    maxFeedItems: 50,
    maxRecommendations: 10,
  };
}

// ============================================================
// PROJECT LOADING
// ============================================================

interface EnabledProject {
  id: string;
  name: string;
  slug: string;
  scoutingConfig: {
    enabled: boolean;
    focusAreas: string[];
    excludeCategories: string[];
    maturityFilter: string;
    maxRecommendations: number;
  };
  deliveryConfig: ProjectDeliveryConfig;
}

async function loadEnabledProjects(): Promise<EnabledProject[]> {
  const admin = getAdminClient();

  // Use existing schema columns
  const { data, error } = await admin
    .from('projects')
    .select('id, name, slug, scouting_enabled, max_recommendations, focus_areas, exclude_categories, export_enabled, notification_channels')
    .eq('scouting_enabled', true);

  if (error) {
    logger.error('Failed to load enabled projects', { error: error.message });
    return [];
  }

  if (!data || data.length === 0) {
    logger.info('No projects with scouting enabled');
    return [];
  }

  return data.map(p => {
    // Parse notification_channels JSONB for email/slack config
    const channels = (p.notification_channels || []) as Array<{
      type: string;
      channel?: string;
      emails?: string[];
      role?: string;
    }>;

    const emailTechnical: string[] = [];
    const emailHuman: string[] = [];
    let slackTechnical: string | undefined;
    let slackHuman: string | undefined;

    for (const ch of channels) {
      if (ch.type === 'email') {
        if (ch.role === 'technical' && ch.emails) {
          emailTechnical.push(...ch.emails);
        } else if (ch.role === 'human' && ch.emails) {
          emailHuman.push(...ch.emails);
        } else if (ch.emails) {
          // Default: send to both
          emailTechnical.push(...ch.emails);
          emailHuman.push(...ch.emails);
        }
      } else if (ch.type === 'slack' && ch.channel) {
        if (ch.role === 'technical') {
          slackTechnical = ch.channel;
        } else if (ch.role === 'human') {
          slackHuman = ch.channel;
        } else {
          // Default: send to same channel for both
          slackTechnical = ch.channel;
          slackHuman = ch.channel;
        }
      }
    }

    return {
      id: p.id,
      name: p.name,
      slug: p.slug,
      scoutingConfig: {
        enabled: p.scouting_enabled,
        focusAreas: p.focus_areas || ['frontend', 'backend'],
        excludeCategories: p.exclude_categories || [],
        maturityFilter: 'early_adopter',
        maxRecommendations: p.max_recommendations || 10,
      },
      deliveryConfig: {
        email: (emailTechnical.length > 0 || emailHuman.length > 0) ? {
          technical: emailTechnical.length > 0 ? emailTechnical : undefined,
          human: emailHuman.length > 0 ? emailHuman : undefined,
        } : undefined,
        slack: (slackTechnical || slackHuman) ? {
          technical: slackTechnical,
          human: slackHuman,
        } : undefined,
        exportPdf: p.export_enabled || false,
      },
    };
  });
}

// ============================================================
// FEED FETCHING (shared across all projects)
// ============================================================

async function fetchSharedFeeds(maxItems: number): Promise<FeedItem[]> {
  logger.info('Fetching shared feed items...', { maxItems });

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

// ============================================================
// PROJECT PIPELINE EXECUTION
// ============================================================

async function runProjectPipeline(
  project: EnabledProject,
  feedItems: FeedItem[],
  options: ScheduledOptions
): Promise<RunResult> {
  const startTime = Date.now();
  const result: RunResult = {
    projectId: project.id,
    projectName: project.name,
    success: false,
    recommendations: 0,
    breakingAlerts: 0,
    deliveries: { email: false, slack: false, pdf: false },
    durationMs: 0,
  };

  logger.info('Processing project', { projectId: project.id, projectName: project.name });

  try {
    const admin = getAdminClient();

    // Load project data
    const [manifestResult, cfFindingsResult, stackHealthResult, stackResult] = await Promise.all([
      admin.from('project_manifest').select('*').eq('project_id', project.id).single(),
      admin.from('cf_findings').select('*').eq('project_id', project.id).eq('is_resolved', false),
      admin.from('stack_health').select('*').eq('project_id', project.id).single(),
      admin.from('project_stack').select('*').eq('project_id', project.id).single(),
    ]);

    const manifest = manifestResult.data;
    const cfFindings = cfFindingsResult.data || [];
    const stackHealth = stackHealthResult.data;
    const stack = stackResult.data;

    // Build profile for matching
    const profile: ProjectProfile = {
      project: {
        id: project.id,
        name: project.name,
        slug: project.slug,
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
        overallScore: stackHealth?.overall_score ?? 0.75,
        components: {
          security: { score: 0.8, details: [] },
          freshness: { score: 0.7, details: [] },
          maintenance: { score: 0.75, details: [] },
          complexity: { score: 0.75, details: [] },
        },
      },
      manifest: {
        objectives: manifest?.objectives || [],
        painPoints: manifest?.pain_points || [],
        constraints: manifest?.constraints || [],
      },
      cfFindings: {
        findings: cfFindings.map((f: { finding_id: string; severity: string; category: string; description: string }) => ({
          id: f.finding_id,
          severity: f.severity,
          category: f.category,
          description: f.description,
        })),
        analyzedAt: cfFindings[0]?.scanned_at || new Date().toISOString(),
      },
      teamRoles: ['developer_fullstack', 'pm'],
      scouting: {
        enabled: true,
        focusAreas: project.scoutingConfig.focusAreas,
        excludeCategories: project.scoutingConfig.excludeCategories,
        maturityFilter: project.scoutingConfig.maturityFilter as 'conservative' | 'early_adopter' | 'bleeding_edge',
        maxRecommendations: project.scoutingConfig.maxRecommendations || options.maxRecommendations,
      },
    };

    // Run matching pipeline
    const matchingResult = await runMatchingPipeline(feedItems, profile);
    const recommendations = matchingResult.recommendations;
    result.recommendations = recommendations.length;

    // Detect breaking changes
    const bcResult = await detectBreakingChanges(profile, {
      checkMajorVersions: true,
      checkSecurityAdvisories: true,
      checkEOL: true,
      maxDependencies: 30,
    });
    const breakingAlerts = bcResult.alerts;
    result.breakingAlerts = breakingAlerts.length;

    if (recommendations.length === 0 && breakingAlerts.length === 0) {
      logger.info('No recommendations or alerts for project', { projectId: project.id });
      result.success = true;
      result.durationMs = Date.now() - startTime;
      return result;
    }

    // Generate briefs
    const technicalBrief = generateTechnicalBrief(project.id, recommendations);
    const humanBrief = generateHumanBrief(project.id, project.name, recommendations);

    // Delivery
    if (!options.dryRun) {
      const delivery = project.deliveryConfig;

      // Email delivery
      if (delivery.email) {
        try {
          if (delivery.email.technical && delivery.email.technical.length > 0) {
            await deliverTechnicalBrief(technicalBrief, delivery.email.technical.map(e => ({ email: e })));
            result.deliveries.email = true;
          }
          if (delivery.email.human && delivery.email.human.length > 0) {
            await deliverHumanBrief(humanBrief, delivery.email.human.map(e => ({ email: e })));
            result.deliveries.email = true;
          }
          if (breakingAlerts.length > 0 && (delivery.email.technical || delivery.email.human)) {
            const alertRecipients = [...(delivery.email.technical || []), ...(delivery.email.human || [])];
            const uniqueRecipients = [...new Set(alertRecipients)];
            await sendBreakingChangeAlerts(project.name, breakingAlerts, uniqueRecipients.map(e => ({ email: e })));
          }
        } catch (error) {
          logger.error('Email delivery failed', { projectId: project.id, error: error instanceof Error ? error.message : String(error) });
        }
      }

      // Slack delivery
      if (delivery.slack) {
        try {
          if (delivery.slack.technical) {
            await deliverTechnicalBriefToSlack(technicalBrief, delivery.slack.technical);
            result.deliveries.slack = true;
          }
          if (delivery.slack.human) {
            await deliverHumanBriefToSlack(humanBrief, delivery.slack.human);
            result.deliveries.slack = true;
          }
          if (breakingAlerts.length > 0 && (delivery.slack.technical || delivery.slack.human)) {
            const alertChannel = delivery.slack.technical || delivery.slack.human;
            await sendBreakingChangeAlertsToSlack(project.name, breakingAlerts, alertChannel);
          }
        } catch (error) {
          logger.error('Slack delivery failed', { projectId: project.id, error: error instanceof Error ? error.message : String(error) });
        }
      }

      // PDF export
      if (delivery.exportPdf) {
        try {
          await exportAndUploadTechnicalBriefPDF(technicalBrief);
          await exportAndUploadHumanBriefPDF(humanBrief);
          result.deliveries.pdf = true;
        } catch (error) {
          logger.error('PDF export failed', { projectId: project.id, error: error instanceof Error ? error.message : String(error) });
        }
      }
    } else {
      logger.info('Dry run - skipping delivery', { projectId: project.id });
    }

    result.success = true;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('Project pipeline failed', { projectId: project.id, error: errorMsg });
    result.error = errorMsg;
  }

  result.durationMs = Date.now() - startTime;
  return result;
}

// ============================================================
// MAIN
// ============================================================

async function scheduledRun() {
  const options = parseArgs();
  const startTime = Date.now();

  console.log('\n' + '='.repeat(60));
  console.log('TECHSCOUT SCHEDULED RUN');
  console.log('='.repeat(60));
  console.log(`Started: ${new Date().toISOString()}`);
  console.log(`Dry Run: ${options.dryRun}`);
  console.log('='.repeat(60) + '\n');

  logger.info('Starting scheduled run', { dryRun: options.dryRun });

  try {
    // Load enabled projects
    const projects = await loadEnabledProjects();
    logger.info('Enabled projects loaded', { count: projects.length });

    if (projects.length === 0) {
      console.log('No projects with scouting enabled. Exiting.');
      process.exit(0);
    }

    console.log(`Found ${projects.length} enabled project(s)\n`);

    // Fetch feeds once for all projects
    const feedItems = await fetchSharedFeeds(options.maxFeedItems);
    logger.info('Shared feeds fetched', { count: feedItems.length });

    if (feedItems.length === 0) {
      console.log('No feed items fetched. Exiting.');
      process.exit(0);
    }

    // Process each project
    const results: RunResult[] = [];

    for (const project of projects) {
      console.log(`Processing: ${project.name} (${project.id})`);
      const result = await runProjectPipeline(project, feedItems, options);
      results.push(result);

      if (result.success) {
        console.log(`  ✓ ${result.recommendations} recommendations, ${result.breakingAlerts} alerts (${result.durationMs}ms)`);
      } else {
        console.log(`  ✗ Failed: ${result.error}`);
      }
    }

    // Summary
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    const successful = results.filter(r => r.success).length;
    const totalRecs = results.reduce((sum, r) => sum + r.recommendations, 0);
    const totalAlerts = results.reduce((sum, r) => sum + r.breakingAlerts, 0);

    console.log('\n' + '='.repeat(60));
    console.log('SCHEDULED RUN COMPLETE');
    console.log('='.repeat(60));
    console.log(`Duration: ${duration}s`);
    console.log(`Projects: ${successful}/${projects.length} successful`);
    console.log(`Total recommendations: ${totalRecs}`);
    console.log(`Total breaking alerts: ${totalAlerts}`);
    console.log(`Finished: ${new Date().toISOString()}`);
    console.log('='.repeat(60) + '\n');

    logger.info('Scheduled run completed', {
      duration,
      projects: projects.length,
      successful,
      totalRecs,
      totalAlerts,
    });

    // Exit with error if any projects failed
    if (successful < projects.length) {
      process.exit(1);
    }

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('Scheduled run failed', { error: errorMsg });
    console.error('\nScheduled run failed:', errorMsg);
    process.exit(1);
  }
}

scheduledRun();
