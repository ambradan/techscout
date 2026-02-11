/**
 * TechScout — GitHub Webhook Server
 *
 * Minimal Express server that handles GitHub push webhooks.
 * When manifest files change, triggers re-ingestion of the project.
 *
 * Endpoints:
 * - POST /webhooks/github  — GitHub push webhook
 * - GET /health            — Health check for monitoring
 *
 * Deploy on Railway, Render, or any VPS (not Vercel/serverless).
 * Run with: npm run server
 */

import express, { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { config } from 'dotenv';
import { logger } from '../lib/logger';
import { fetchGitHubProjectProfile } from '../providers/github';
import { calculateStackHealth } from '../providers/normalizer';
import {
  upsertProjectStack,
  upsertStackHealth,
  getProjectSources,
  appendAuditLog,
} from '../db/queries';
import { getAdminClient } from '../db/client';
import type { ProjectSourceEntity } from '../types';

// Load environment variables
config();

// ============================================================
// CONFIGURATION
// ============================================================

const PORT = parseInt(process.env.WEBHOOK_PORT ?? '3001', 10);

// Read secret at runtime to support testing
function getWebhookSecret(): string | undefined {
  return process.env.GITHUB_WEBHOOK_SECRET;
}

// Manifest files that trigger re-ingestion when modified
const MANIFEST_FILES = [
  'package.json',
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'requirements.txt',
  'pyproject.toml',
  'Pipfile',
  'Pipfile.lock',
  'Cargo.toml',
  'Cargo.lock',
  'go.mod',
  'go.sum',
  'Gemfile',
  'Gemfile.lock',
  'composer.json',
  'composer.lock',
  'pubspec.yaml',
  'pubspec.lock',
  'build.gradle',
  'pom.xml',
  'mix.exs',
] as const;

// ============================================================
// SIGNATURE VERIFICATION
// ============================================================

/**
 * Verify GitHub webhook signature using HMAC SHA-256.
 * Returns true if signature is valid.
 */
export function verifyGitHubSignature(
  payload: string,
  signature: string | undefined,
  secret: string
): boolean {
  if (!signature) {
    return false;
  }

  // GitHub sends signature as "sha256=<hash>"
  const parts = signature.split('=');
  if (parts.length !== 2 || parts[0] !== 'sha256') {
    return false;
  }

  const expectedSignature = parts[1];
  const hmac = crypto.createHmac('sha256', secret);
  const digest = hmac.update(payload).digest('hex');

  // Use timing-safe comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(
      Buffer.from(digest, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );
  } catch {
    return false;
  }
}

// ============================================================
// MANIFEST FILE DETECTION
// ============================================================

/**
 * Check if any of the modified files are manifest files.
 * Returns the list of manifest files that were modified.
 */
export function getModifiedManifestFiles(commits: GitHubCommit[]): string[] {
  const modifiedManifests = new Set<string>();

  for (const commit of commits) {
    const allFiles = [
      ...(commit.added ?? []),
      ...(commit.modified ?? []),
      ...(commit.removed ?? []),
    ];

    for (const file of allFiles) {
      const fileName = file.split('/').pop() ?? '';
      if (MANIFEST_FILES.includes(fileName as typeof MANIFEST_FILES[number])) {
        modifiedManifests.add(file);
      }
    }
  }

  return Array.from(modifiedManifests);
}

// ============================================================
// GITHUB WEBHOOK TYPES
// ============================================================

interface GitHubCommit {
  id: string;
  message: string;
  added?: string[];
  modified?: string[];
  removed?: string[];
}

interface GitHubPushPayload {
  ref: string;
  repository: {
    id: number;
    full_name: string;
    name: string;
    owner: {
      login: string;
    };
    clone_url: string;
    html_url: string;
  };
  commits: GitHubCommit[];
  sender: {
    login: string;
  };
}

// ============================================================
// PROJECT LOOKUP
// ============================================================

/**
 * Find projects associated with a GitHub repository.
 * Searches project_sources for matching GitHub URLs.
 */
async function findProjectsByRepoUrl(
  repoFullName: string
): Promise<{ projectId: string; source: ProjectSourceEntity }[]> {
  const admin = getAdminClient();

  // Search for project sources with this repo
  // connection_config contains { owner, repo } for GitHub sources
  const { data, error } = await admin
    .from('project_sources')
    .select('*')
    .eq('provider', 'github');

  if (error) {
    logger.error('Failed to query project_sources', { error });
    return [];
  }

  const results: { projectId: string; source: ProjectSourceEntity }[] = [];

  for (const source of data ?? []) {
    const config = source.connection_config as {
      owner?: string;
      repo?: string;
    };
    const sourceFullName = `${config.owner}/${config.repo}`;

    if (sourceFullName.toLowerCase() === repoFullName.toLowerCase()) {
      results.push({
        projectId: source.project_id,
        source: source as ProjectSourceEntity,
      });
    }
  }

  return results;
}

// ============================================================
// RE-INGESTION LOGIC
// ============================================================

/**
 * Re-ingest a project from GitHub and update stack/health.
 */
async function reIngestProject(
  projectId: string,
  owner: string,
  repo: string,
  branch?: string
): Promise<void> {
  logger.info('Starting re-ingestion', { projectId, owner, repo, branch });

  try {
    // Fetch updated profile from GitHub
    const profile = await fetchGitHubProjectProfile({ owner, name: repo, branch });

    if (!profile.stack) {
      logger.warn('No stack data in profile', { projectId });
      return;
    }

    // Update project_stack
    await upsertProjectStack({
      projectId,
      languages: profile.stack.languages ?? [],
      frameworks: profile.stack.frameworks ?? [],
      databases: profile.stack.databases ?? [],
      infrastructure: profile.stack.infrastructure ?? {},
      keyDependencies: profile.stack.keyDependencies ?? [],
      allDependencies: profile.stack.allDependencies ?? {},
    });

    // Recalculate and update stack_health
    const health = calculateStackHealth({
      languages: profile.stack.languages ?? [],
      frameworks: profile.stack.frameworks ?? [],
      databases: profile.stack.databases ?? [],
      infrastructure: profile.stack.infrastructure ?? { hosting: [], ciCd: [] },
      keyDependencies: profile.stack.keyDependencies ?? [],
      allDependencies: profile.stack.allDependencies ?? {},
    });

    await upsertStackHealth({
      projectId,
      overallScore: health.overallScore,
      components: health.components,
    });

    // Log the re-ingestion
    await appendAuditLog({
      projectId,
      action: 'webhook_reingestion',
      detail: `Re-ingested from ${owner}/${repo}`,
      actor: 'webhook_server',
      actorType: 'system',
      metadata: {
        owner,
        repo,
        branch,
        healthScore: health.overallScore,
      },
    });

    logger.info('Re-ingestion completed', {
      projectId,
      healthScore: health.overallScore,
    });
  } catch (error) {
    logger.error('Re-ingestion failed', { projectId, owner, repo, error });
    throw error;
  }
}

// ============================================================
// BREAKING CHANGE DETECTION (OPTIONAL)
// ============================================================

/**
 * Check if project has immediate breaking change alerts enabled.
 * If so, trigger breaking change detection for new dependencies.
 */
async function checkBreakingChangeConfig(projectId: string): Promise<boolean> {
  const admin = getAdminClient();

  const { data: project } = await admin
    .from('projects')
    .select('notification_channels')
    .eq('id', projectId)
    .single();

  // Check if breaking_changes.delivery is "immediate"
  // This would be in a project settings table - for now, return false
  // The actual implementation would query project scouting config
  return false;
}

// ============================================================
// EXPRESS APP
// ============================================================

export const app = express();

// Parse raw body for signature verification
app.use(
  express.json({
    verify: (req: Request, _res: Response, buf: Buffer) => {
      (req as Request & { rawBody: string }).rawBody = buf.toString();
    },
  })
);

// ============================================================
// HEALTH ENDPOINT
// ============================================================

app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'techscout-webhook',
    version: '1.0.0',
  });
});

// ============================================================
// GITHUB WEBHOOK ENDPOINT
// ============================================================

app.post(
  '/webhooks/github',
  async (req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now();

    try {
      // Check webhook secret is configured
      const webhookSecret = getWebhookSecret();
      if (!webhookSecret) {
        logger.error('GITHUB_WEBHOOK_SECRET not configured');
        res.status(500).json({ error: 'Webhook secret not configured' });
        return;
      }

      // Get raw body for signature verification
      const rawBody = (req as Request & { rawBody: string }).rawBody;
      if (!rawBody) {
        logger.warn('No raw body available');
        res.status(400).json({ error: 'Invalid request body' });
        return;
      }

      // Verify signature
      const signature = req.headers['x-hub-signature-256'] as string | undefined;
      if (!verifyGitHubSignature(rawBody, signature, webhookSecret)) {
        logger.warn('Invalid webhook signature');
        res.status(401).json({ error: 'Invalid signature' });
        return;
      }

      // Check event type
      const event = req.headers['x-github-event'] as string;
      if (event !== 'push') {
        logger.debug('Ignoring non-push event', { event });
        res.status(200).json({ message: 'Event ignored', event });
        return;
      }

      // Parse payload
      const payload = req.body as GitHubPushPayload;
      const repoFullName = payload.repository.full_name;
      const owner = payload.repository.owner.login;
      const repo = payload.repository.name;

      logger.info('Received push webhook', {
        repo: repoFullName,
        commits: payload.commits.length,
      });

      // Check for manifest file changes
      const modifiedManifests = getModifiedManifestFiles(payload.commits);

      if (modifiedManifests.length === 0) {
        logger.debug('No manifest files modified, ignoring', { repo: repoFullName });
        res.status(200).json({
          message: 'No manifest changes detected',
          repo: repoFullName,
        });
        return;
      }

      logger.info('Manifest files modified', {
        repo: repoFullName,
        files: modifiedManifests,
      });

      // Find associated projects
      const projects = await findProjectsByRepoUrl(repoFullName);

      if (projects.length === 0) {
        logger.info('No projects found for repo', { repo: repoFullName });
        res.status(200).json({
          message: 'No associated projects',
          repo: repoFullName,
        });
        return;
      }

      // Re-ingest each project
      const results: Array<{ projectId: string; success: boolean; error?: string }> = [];

      for (const { projectId, source } of projects) {
        try {
          const config = source.connection_config as { branch?: string };
          await reIngestProject(projectId, owner, repo, config.branch);
          results.push({ projectId, success: true });

          // Optional: check for immediate breaking change detection
          const hasImmediateAlerts = await checkBreakingChangeConfig(projectId);
          if (hasImmediateAlerts) {
            logger.info('Would trigger immediate breaking change detection', {
              projectId,
            });
            // TODO: Implement breaking change detection trigger
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          results.push({ projectId, success: false, error: errorMessage });
        }
      }

      const duration = Date.now() - startTime;
      logger.info('Webhook processing complete', {
        repo: repoFullName,
        projectsProcessed: projects.length,
        duration: `${duration}ms`,
      });

      res.status(200).json({
        message: 'Webhook processed',
        repo: repoFullName,
        modifiedManifests,
        results,
        duration: `${duration}ms`,
      });
    } catch (error) {
      next(error);
    }
  }
);

// ============================================================
// ERROR HANDLER
// ============================================================

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  logger.error('Unhandled error in webhook server', { error: err.message });
  res.status(500).json({ error: 'Internal server error' });
});

// ============================================================
// SERVER START
// ============================================================

export function startServer(): void {
  app.listen(PORT, () => {
    logger.info(`Webhook server listening on port ${PORT}`);
    console.log(`TechScout Webhook Server started on http://localhost:${PORT}`);
    console.log('Endpoints:');
    console.log(`  GET  /health          - Health check`);
    console.log(`  POST /webhooks/github - GitHub push webhook`);
  });
}

// Start if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  if (!getWebhookSecret()) {
    console.error('ERROR: GITHUB_WEBHOOK_SECRET environment variable is required');
    process.exit(1);
  }
  startServer();
}
