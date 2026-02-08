/**
 * TechScout — Seed Script
 *
 * Creates a sample project in Supabase with realistic data.
 * Based on the example in project_profile.schema.yaml.
 *
 * Usage: npm run seed
 */

import 'dotenv/config';
import { supabase, getAdminClient, checkDatabaseHealth } from '../src/db/client';
import {
  createProject,
  createProjectSource,
  createTeamMember,
  upsertProjectStack,
  upsertProjectManifest,
  createCFFinding,
  upsertStackHealth,
  upsertGovernanceMetadata,
} from '../src/db/queries';
import { logger } from '../src/lib/logger';

// ============================================================
// SAMPLE DATA (from project_profile.schema.yaml)
// ============================================================

const SAMPLE_PROJECT = {
  name: 'BetStarters Sales Automation',
  slug: 'betstarters-sales',
  scoutingEnabled: true,
  scoutingFrequency: 'weekly',
  maxRecommendations: 5,
  focusAreas: ['security', 'performance', 'developer_experience'],
  excludeCategories: ['mobile', 'blockchain'],
};

const SAMPLE_TEAM = [
  {
    name: 'Ambra',
    role: 'developer_fullstack',
    receivesTechnicalBrief: true,
    receivesHumanBrief: false,
    notificationChannel: 'email',
  },
  {
    name: 'Marco',
    role: 'pm',
    receivesTechnicalBrief: false,
    receivesHumanBrief: true,
    notificationChannel: 'email',
  },
];

const SAMPLE_SOURCES = [
  {
    provider: 'github',
    connectionType: 'oauth',
    connectionConfig: {
      type: 'oauth',
      repos: [
        { owner: 'ambra-org', name: 'betstarters-frontend', branch: 'main' },
        { owner: 'ambra-org', name: 'betstarters-backend', branch: 'main' },
      ],
    },
  },
  {
    provider: 'railway',
    connectionType: 'token',
    connectionConfig: {
      type: 'token',
      projectId: 'prj_xxxxx',
    },
  },
  {
    provider: 'vercel',
    connectionType: 'token',
    connectionConfig: {
      type: 'token',
      projectId: 'prj_xxxxx',
    },
  },
];

const SAMPLE_STACK = {
  languages: [
    { name: 'TypeScript', percentage: 62.3, role: 'primary' },
    { name: 'Python', percentage: 28.1, role: 'secondary' },
    { name: 'SQL', percentage: 5.2, role: 'config' },
    { name: 'Shell', percentage: 4.4, role: 'scripting' },
  ],
  frameworks: [
    { name: 'Next.js', version: '14.2.1', category: 'frontend' },
    { name: 'FastAPI', version: '0.109.0', category: 'backend' },
    { name: 'Tailwind CSS', version: '3.4.1', category: 'styling' },
  ],
  databases: [
    { name: 'PostgreSQL', version: '15', provider: 'Supabase' },
    { name: 'Redis', version: '7', provider: 'Railway' },
  ],
  infrastructure: {
    hosting: [
      { name: 'Railway', services: ['backend-api', 'redis', 'worker'] },
      { name: 'Vercel', services: ['frontend'] },
    ],
    ciCd: [{ name: 'GitHub Actions' }],
    containerization: [{ name: 'Docker', version: '24' }],
  },
  keyDependencies: [
    { name: 'supabase-js', version: '2.39.0', ecosystem: 'npm', category: 'database_client' },
    { name: 'openai', version: '4.28.0', ecosystem: 'pip', category: 'ai_sdk' },
    { name: 'jsonwebtoken', version: '9.0.2', ecosystem: 'npm', category: 'auth' },
  ],
  allDependencies: {
    npm: { direct: 47, dev: 23, packages: ['next', 'react', 'supabase-js'] },
    pip: { direct: 18, dev: 8, packages: ['fastapi', 'uvicorn', 'openai'] },
  },
};

const SAMPLE_MANIFEST = {
  phase: 'growth',
  description: `Piattaforma di sales automation per BetStarters.
Frontend Next.js, backend FastAPI, AI-powered lead scoring
e pipeline management con integrazione CRM.`,
  objectives: [
    'Ridurre il tempo di risposta ai lead sotto i 5 minuti',
    'Automatizzare il 70% delle comunicazioni follow-up',
    'Integrare market intelligence da fonti esterne',
  ],
  painPoints: [
    'Le Edge Functions su Supabase hanno cold start troppo alti',
    'Il rate limiting dell\'API OpenAI causa timeout in produzione',
    'Manca un sistema di caching intelligente per le risposte AI',
  ],
  constraints: [
    'Budget infra max 200 euro/mese',
    'Team di 1 persona (freelancer)',
    'GDPR compliance obbligatoria',
    'No vendor lock-in su servizi AI',
  ],
  openTo: [
    'Cambiare provider AI (non solo OpenAI)',
    'Migrare da Edge Functions a altro runtime',
    'Adottare nuovi tool di monitoring',
  ],
  notOpenTo: [
    'Migrare da Supabase (PostgreSQL)',
    'Riscrivere il frontend da zero',
    'Cambiare linguaggio principale',
  ],
};

const SAMPLE_CF_FINDINGS = [
  {
    findingId: 'CF-2026-001',
    layer: 'L1',
    category: 'crypto',
    severity: 'high',
    patternId: 'CRYPTO-WEAK-HASH',
    description: 'Uso di algoritmo di hashing non raccomandato per password storage',
    filesAffected: 2,
    ifxTag: 'FACT',
    scanVersion: '4.0.0',
    scannedAt: '2026-02-06T08:00:00Z',
  },
  {
    findingId: 'CF-2026-002',
    layer: 'L1',
    category: 'auth',
    severity: 'high',
    patternId: 'AUTH-JWT-NO-EXPIRY',
    description: 'Token JWT senza expiry esplicito in 3 endpoint',
    filesAffected: 3,
    ifxTag: 'FACT',
    scanVersion: '4.0.0',
    scannedAt: '2026-02-06T08:00:00Z',
  },
  {
    findingId: 'CF-2026-003',
    layer: 'L1',
    category: 'compliance',
    severity: 'medium',
    patternId: 'GDPR-PII-LOGGING',
    description: 'Possibile logging di PII senza sanitizzazione',
    filesAffected: 5,
    ifxTag: 'INFERENCE',
    scanVersion: '4.0.0',
    scannedAt: '2026-02-06T08:00:00Z',
  },
];

const SAMPLE_STACK_HEALTH = {
  overallScore: 0.72,
  components: {
    security: {
      score: 0.55,
      factors: [
        '2 CF findings severity HIGH',
        'jsonwebtoken non ha advisory ma ha finding custom',
      ],
    },
    freshness: {
      score: 0.80,
      factors: [
        '85% dipendenze entro 2 major versions dal latest',
        'Next.js 14.2 (latest: 15.1) - 1 major behind',
        'FastAPI 0.109 (latest: 0.115) - minor behind',
      ],
    },
    maintenanceRisk: {
      score: 0.90,
      factors: [
        'Tutte le dipendenze chiave hanno maintainer attivi',
        'Nessuna dipendenza con >6 mesi senza commit',
      ],
    },
    complexity: {
      score: 0.65,
      factors: [
        '2 linguaggi primari',
        '3 piattaforme di hosting',
        '47+18 dipendenze dirette',
      ],
    },
  },
};

// ============================================================
// MAIN SEED FUNCTION
// ============================================================

async function seed() {
  logger.info('Starting seed script...');

  // Check database connection
  const health = await checkDatabaseHealth();
  if (!health.healthy) {
    logger.error('Database connection failed', { error: health.error });
    process.exit(1);
  }
  logger.info('Database connection healthy', { latencyMs: health.latencyMs });

  // We need an owner_id. In a real scenario, this would be the authenticated user.
  // For seeding, we'll create a fake UUID.
  const ownerId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

  try {
    // 1. Create project
    logger.info('Creating project...');
    const project = await createProject({
      ownerId,
      ...SAMPLE_PROJECT,
    });
    logger.info('Project created', { projectId: project.id, name: project.name });

    // 2. Create team members
    logger.info('Creating team members...');
    for (const member of SAMPLE_TEAM) {
      const userId = `user-${member.name.toLowerCase()}-${Date.now()}`;
      await createTeamMember({
        projectId: project.id,
        userId,
        ...member,
      });
      logger.info('Team member created', { name: member.name, role: member.role });
    }

    // 3. Create sources
    logger.info('Creating project sources...');
    for (const source of SAMPLE_SOURCES) {
      await createProjectSource({
        projectId: project.id,
        provider: source.provider,
        connectionType: source.connectionType,
        connectionConfig: source.connectionConfig,
      });
      logger.info('Source created', { provider: source.provider });
    }

    // 4. Create stack
    logger.info('Creating project stack...');
    await upsertProjectStack({
      projectId: project.id,
      languages: SAMPLE_STACK.languages,
      frameworks: SAMPLE_STACK.frameworks,
      databases: SAMPLE_STACK.databases,
      infrastructure: SAMPLE_STACK.infrastructure,
      keyDependencies: SAMPLE_STACK.keyDependencies,
      allDependencies: SAMPLE_STACK.allDependencies,
    });
    logger.info('Stack created');

    // 5. Create manifest
    logger.info('Creating project manifest...');
    await upsertProjectManifest({
      projectId: project.id,
      ...SAMPLE_MANIFEST,
    });
    logger.info('Manifest created');

    // 6. Create CF findings
    logger.info('Creating CF findings...');
    for (const finding of SAMPLE_CF_FINDINGS) {
      await createCFFinding({
        projectId: project.id,
        ...finding,
      });
      logger.info('CF finding created', {
        findingId: finding.findingId,
        severity: finding.severity,
      });
    }

    // 7. Create stack health
    logger.info('Creating stack health...');
    await upsertStackHealth({
      projectId: project.id,
      overallScore: SAMPLE_STACK_HEALTH.overallScore,
      components: SAMPLE_STACK_HEALTH.components,
    });
    logger.info('Stack health created', { score: SAMPLE_STACK_HEALTH.overallScore });

    // 8. Create governance metadata
    logger.info('Creating governance metadata...');
    await upsertGovernanceMetadata({
      projectId: project.id,
      ifxVersion: '1.0',
      kqrVersion: '1.0',
      profileCompletenessScore: 0.85,
      dataSourcesUsed: [
        { source: 'github_api', reliability: 'high', lastFetched: new Date().toISOString() },
        { source: 'user_manifest', reliability: 'medium', lastFetched: new Date().toISOString() },
        { source: 'code_forensics_l1', reliability: 'high', lastFetched: '2026-02-06T08:00:00Z' },
      ],
    });
    logger.info('Governance metadata created');

    // Summary
    logger.info('Seed completed successfully!', {
      projectId: project.id,
      projectName: project.name,
      teamMembers: SAMPLE_TEAM.length,
      sources: SAMPLE_SOURCES.length,
      cfFindings: SAMPLE_CF_FINDINGS.length,
    });

    console.log('\n===========================================');
    console.log('SEED COMPLETED SUCCESSFULLY');
    console.log('===========================================');
    console.log(`Project ID: ${project.id}`);
    console.log(`Project Name: ${project.name}`);
    console.log(`Project Slug: ${project.slug}`);
    console.log(`Owner ID: ${ownerId}`);
    console.log('===========================================\n');

  } catch (error) {
    logger.error('Seed failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    console.error('Full error:', error);
    process.exit(1);
  }
}

// Run seed
seed();
