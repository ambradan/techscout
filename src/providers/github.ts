/**
 * TechScout — GitHub Provider
 *
 * Extracts project profile data from GitHub repositories.
 * Fetches:
 * - Repository metadata (languages, topics)
 * - Dependency files (package.json, requirements.txt, etc.)
 * - Parses dependencies (direct + dev)
 *
 * OUTPUT: PartialProjectProfile
 *
 * DATA FLOW RULES (NON-NEGOTIABLE):
 * - NEVER fetch or store source code
 * - ONLY metadata, dependency lists, and manifest files
 */

import { Octokit } from 'octokit';
import { logger } from '../lib/logger';
import type {
  PartialProjectProfile,
  ProjectStack,
  LanguageInfo,
  FrameworkInfo,
  KeyDependency,
  DependencyEcosystem,
} from '../types';

// ============================================================
// TYPES
// ============================================================

interface GitHubRepoInput {
  owner: string;
  name: string;
  branch?: string;
}

interface PackageJson {
  name?: string;
  version?: string;
  description?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

interface RequirementsTxt {
  packages: Array<{ name: string; version?: string }>;
}

interface CargoToml {
  dependencies?: Record<string, string | { version: string }>;
  devDependencies?: Record<string, string | { version: string }>;
}

interface GoMod {
  require?: Array<{ path: string; version: string }>;
}

interface Gemfile {
  gems: Array<{ name: string; version?: string; group?: string }>;
}

interface ComposerJson {
  name?: string;
  require?: Record<string, string>;
  requireDev?: Record<string, string>;
}

// ============================================================
// ALLOWED MANIFEST FILES (NEVER SOURCE CODE)
// ============================================================

const ALLOWED_MANIFEST_FILES = [
  // JavaScript/TypeScript
  'package.json',
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  // Python
  'requirements.txt',
  'pyproject.toml',
  'Pipfile',
  // Rust
  'Cargo.toml',
  // Go
  'go.mod',
  'go.sum',
  // Ruby
  'Gemfile',
  'Gemfile.lock',
  // PHP
  'composer.json',
  'composer.lock',
  // Dart/Flutter
  'pubspec.yaml',
  // Java/Kotlin
  'build.gradle',
  'pom.xml',
  // Elixir
  'mix.exs',
] as const;

type ManifestFileName = typeof ALLOWED_MANIFEST_FILES[number];

// ============================================================
// GITHUB CLIENT
// ============================================================

let octokit: Octokit | null = null;

function getOctokit(): Octokit {
  if (!octokit) {
    const token = process.env.GITHUB_TOKEN;
    if (!token) {
      const error = 'GITHUB_TOKEN environment variable is required';
      logger.error(error);
      throw new Error(error);
    }
    octokit = new Octokit({ auth: token });
    logger.debug('GitHub client initialized');
  }
  return octokit;
}

// ============================================================
// DEPENDENCY FILE FETCHERS
// ============================================================

/**
 * Fetch file content from GitHub.
 * SECURITY: Only allows fetching files from ALLOWED_MANIFEST_FILES.
 */
async function fetchFileContent(
  owner: string,
  repo: string,
  path: string,
  ref?: string
): Promise<string | null> {
  // SECURITY CHECK: Only allow manifest files
  const fileName = path.split('/').pop() as string;
  if (!ALLOWED_MANIFEST_FILES.includes(fileName as ManifestFileName)) {
    logger.warn('Attempted to fetch non-manifest file', { path, fileName });
    throw new Error(`Security violation: Cannot fetch non-manifest file: ${path}`);
  }

  try {
    const client = getOctokit();
    logger.debug('Fetching file', { owner, repo, path });

    const response = await client.rest.repos.getContent({
      owner,
      repo,
      path,
      ref,
    });

    if ('content' in response.data && response.data.type === 'file') {
      logger.debug('File fetched successfully', { path, size: response.data.size });
      return Buffer.from(response.data.content, 'base64').toString('utf-8');
    }
    return null;
  } catch (error) {
    // File not found is not an error, just means repo doesn't have this file
    if (error && typeof error === 'object' && 'status' in error && error.status === 404) {
      logger.debug('File not found', { path });
      return null;
    }
    logger.error('Failed to fetch file', { path, error });
    throw error;
  }
}

async function fetchPackageJson(
  owner: string,
  repo: string,
  ref?: string
): Promise<PackageJson | null> {
  const content = await fetchFileContent(owner, repo, 'package.json', ref);
  if (!content) return null;

  try {
    return JSON.parse(content) as PackageJson;
  } catch {
    console.warn(`Failed to parse package.json for ${owner}/${repo}`);
    return null;
  }
}

async function fetchRequirementsTxt(
  owner: string,
  repo: string,
  ref?: string
): Promise<RequirementsTxt | null> {
  const content = await fetchFileContent(owner, repo, 'requirements.txt', ref);
  if (!content) return null;

  const packages: Array<{ name: string; version?: string }> = [];
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('-')) continue;

    // Parse package==version or package>=version, etc.
    const match = trimmed.match(/^([a-zA-Z0-9_-]+)([=<>!~]+)?(.+)?$/);
    if (match) {
      packages.push({
        name: match[1],
        version: match[3]?.trim(),
      });
    }
  }

  return { packages };
}

async function fetchPyprojectToml(
  owner: string,
  repo: string,
  ref?: string
): Promise<string[] | null> {
  const content = await fetchFileContent(owner, repo, 'pyproject.toml', ref);
  if (!content) return null;

  // Simple extraction of dependencies from pyproject.toml
  // For full parsing, would need a TOML parser
  const packages: string[] = [];
  const dependenciesMatch = content.match(/dependencies\s*=\s*\[([\s\S]*?)\]/);
  if (dependenciesMatch) {
    const deps = dependenciesMatch[1].match(/"([^"]+)"/g);
    if (deps) {
      for (const dep of deps) {
        const name = dep.replace(/"/g, '').split(/[<>=!~]/)[0].trim();
        if (name) packages.push(name);
      }
    }
  }

  return packages.length > 0 ? packages : null;
}

async function fetchCargoToml(
  owner: string,
  repo: string,
  ref?: string
): Promise<CargoToml | null> {
  const content = await fetchFileContent(owner, repo, 'Cargo.toml', ref);
  if (!content) return null;

  // Simple extraction - for full parsing would need a TOML parser
  const dependencies: Record<string, string> = {};

  // Match [dependencies] section
  const depsSection = content.match(/\[dependencies\]([\s\S]*?)(\[|$)/);
  if (depsSection) {
    const lines = depsSection[1].split('\n');
    for (const line of lines) {
      const match = line.match(/^(\w+)\s*=\s*"([^"]+)"/);
      if (match) {
        dependencies[match[1]] = match[2];
      }
    }
  }

  return Object.keys(dependencies).length > 0 ? { dependencies } : null;
}

async function fetchGoMod(
  owner: string,
  repo: string,
  ref?: string
): Promise<GoMod | null> {
  const content = await fetchFileContent(owner, repo, 'go.mod', ref);
  if (!content) return null;

  const require: Array<{ path: string; version: string }> = [];

  // Match require ( ... ) block
  const requireBlock = content.match(/require\s*\(([\s\S]*?)\)/);
  if (requireBlock) {
    const lines = requireBlock[1].split('\n');
    for (const line of lines) {
      const match = line.match(/^\s*([\w./-]+)\s+v?([\d.]+)/);
      if (match) {
        require.push({ path: match[1], version: match[2] });
      }
    }
  }

  // Also match single-line require
  const singleRequires = content.matchAll(/require\s+([\w./-]+)\s+v?([\d.]+)/g);
  for (const match of singleRequires) {
    require.push({ path: match[1], version: match[2] });
  }

  return require.length > 0 ? { require } : null;
}

async function fetchGemfile(
  owner: string,
  repo: string,
  ref?: string
): Promise<Gemfile | null> {
  const content = await fetchFileContent(owner, repo, 'Gemfile', ref);
  if (!content) return null;

  const gems: Array<{ name: string; version?: string; group?: string }> = [];
  let currentGroup: string | undefined;

  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    // Match group block
    const groupMatch = trimmed.match(/^group\s+:(\w+)/);
    if (groupMatch) {
      currentGroup = groupMatch[1];
      continue;
    }

    // Match end of group
    if (trimmed === 'end') {
      currentGroup = undefined;
      continue;
    }

    // Match gem 'name', 'version' or gem 'name'
    const gemMatch = trimmed.match(/^gem\s+['"]([^'"]+)['"]\s*(?:,\s*['"]([^'"]+)['"])?/);
    if (gemMatch) {
      gems.push({
        name: gemMatch[1],
        version: gemMatch[2],
        group: currentGroup,
      });
    }
  }

  return gems.length > 0 ? { gems } : null;
}

async function fetchComposerJson(
  owner: string,
  repo: string,
  ref?: string
): Promise<ComposerJson | null> {
  const content = await fetchFileContent(owner, repo, 'composer.json', ref);
  if (!content) return null;

  try {
    const parsed = JSON.parse(content);
    return {
      name: parsed.name,
      require: parsed.require,
      requireDev: parsed['require-dev'],
    };
  } catch {
    logger.warn(`Failed to parse composer.json for ${owner}/${repo}`);
    return null;
  }
}

// ============================================================
// FRAMEWORK DETECTION
// ============================================================

const FRAMEWORK_PATTERNS: Record<string, { name: string; category: string }> = {
  // Frontend
  'next': { name: 'Next.js', category: 'frontend' },
  'react': { name: 'React', category: 'frontend' },
  'vue': { name: 'Vue.js', category: 'frontend' },
  'nuxt': { name: 'Nuxt.js', category: 'frontend' },
  'angular': { name: 'Angular', category: 'frontend' },
  'svelte': { name: 'Svelte', category: 'frontend' },
  'solid-js': { name: 'SolidJS', category: 'frontend' },
  // Backend
  'express': { name: 'Express', category: 'backend' },
  'fastify': { name: 'Fastify', category: 'backend' },
  'hono': { name: 'Hono', category: 'backend' },
  'koa': { name: 'Koa', category: 'backend' },
  'nestjs': { name: 'NestJS', category: 'backend' },
  '@nestjs/core': { name: 'NestJS', category: 'backend' },
  'fastapi': { name: 'FastAPI', category: 'backend' },
  'django': { name: 'Django', category: 'backend' },
  'flask': { name: 'Flask', category: 'backend' },
  'actix-web': { name: 'Actix Web', category: 'backend' },
  'axum': { name: 'Axum', category: 'backend' },
  // Styling
  'tailwindcss': { name: 'Tailwind CSS', category: 'styling' },
  '@emotion/react': { name: 'Emotion', category: 'styling' },
  'styled-components': { name: 'Styled Components', category: 'styling' },
  // Testing
  'vitest': { name: 'Vitest', category: 'testing' },
  'jest': { name: 'Jest', category: 'testing' },
  'mocha': { name: 'Mocha', category: 'testing' },
  'pytest': { name: 'Pytest', category: 'testing' },
};

const KEY_DEPENDENCY_PATTERNS: Record<string, string> = {
  // Database clients
  '@supabase/supabase-js': 'database_client',
  'supabase': 'database_client',
  'prisma': 'orm',
  '@prisma/client': 'orm',
  'drizzle-orm': 'orm',
  'pg': 'database_client',
  'mysql2': 'database_client',
  'mongoose': 'database_client',
  'redis': 'cache',
  'ioredis': 'cache',
  // Auth
  'better-auth': 'auth',
  'next-auth': 'auth',
  '@auth/core': 'auth',
  'jsonwebtoken': 'auth',
  'passport': 'auth',
  // AI
  '@anthropic-ai/sdk': 'ai_sdk',
  'openai': 'ai_sdk',
  'langchain': 'ai_sdk',
  '@langchain/core': 'ai_sdk',
  // Utilities
  'zod': 'validation',
  'yup': 'validation',
  'axios': 'http_client',
  'ky': 'http_client',
  'got': 'http_client',
  // State management
  'zustand': 'state_management',
  'jotai': 'state_management',
  'recoil': 'state_management',
  '@tanstack/react-query': 'data_fetching',
  'swr': 'data_fetching',
};

function detectFrameworks(
  packageJson: PackageJson | null
): FrameworkInfo[] {
  if (!packageJson) return [];

  const frameworks: FrameworkInfo[] = [];
  const allDeps = {
    ...packageJson.dependencies,
    ...packageJson.devDependencies,
  };

  for (const [dep, version] of Object.entries(allDeps)) {
    const framework = FRAMEWORK_PATTERNS[dep];
    if (framework) {
      // Clean version (remove ^, ~, etc.)
      const cleanVersion = version.replace(/^[^0-9]*/, '');
      frameworks.push({
        name: framework.name,
        version: cleanVersion,
        category: framework.category as 'frontend' | 'backend' | 'styling' | 'testing' | 'build' | 'other',
      });
    }
  }

  return frameworks;
}

function extractKeyDependencies(
  packageJson: PackageJson | null,
  pythonDeps: string[]
): KeyDependency[] {
  const keyDeps: KeyDependency[] = [];

  // npm dependencies
  if (packageJson) {
    const allDeps = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
    };

    for (const [dep, version] of Object.entries(allDeps)) {
      const category = KEY_DEPENDENCY_PATTERNS[dep];
      if (category) {
        keyDeps.push({
          name: dep,
          version: version.replace(/^[^0-9]*/, ''),
          ecosystem: 'npm',
          category,
        });
      }
    }
  }

  // Python dependencies
  for (const dep of pythonDeps) {
    const category = KEY_DEPENDENCY_PATTERNS[dep.toLowerCase()];
    if (category) {
      keyDeps.push({
        name: dep,
        version: 'unknown',
        ecosystem: 'pip',
        category,
      });
    }
  }

  return keyDeps;
}

// ============================================================
// PUBLIC API FUNCTIONS
// ============================================================

/**
 * Repository metadata returned by fetchRepoMetadata.
 */
export interface RepoMetadata {
  id: number;
  fullName: string;
  description: string | null;
  topics: string[];
  defaultBranch: string;
  visibility: string;
  createdAt: string;
  updatedAt: string;
  pushedAt: string;
  stargazersCount: number;
  forksCount: number;
  languages: Record<string, number>;
  languageBreakdown: LanguageInfo[];
}

/**
 * Fetch repository metadata: languages, topics, default branch.
 * Does NOT fetch any source code.
 */
export async function fetchRepoMetadata(
  owner: string,
  repo: string
): Promise<RepoMetadata> {
  logger.info('Fetching repo metadata', { owner, repo });
  const client = getOctokit();

  // Fetch repo info
  const repoResponse = await client.rest.repos.get({ owner, repo });
  const repoData = repoResponse.data;

  // Fetch language breakdown
  const languagesResponse = await client.rest.repos.listLanguages({ owner, repo });
  const languagesData = languagesResponse.data;
  const totalBytes = Object.values(languagesData).reduce((a, b) => a + b, 0);

  const languageBreakdown: LanguageInfo[] = Object.entries(languagesData)
    .map(([lang, bytes], index) => ({
      name: lang,
      percentage: totalBytes > 0 ? Math.round((bytes / totalBytes) * 1000) / 10 : 0,
      role: (index === 0 ? 'primary' : index === 1 ? 'secondary' : 'config') as 'primary' | 'secondary' | 'config' | 'scripting',
    }))
    .slice(0, 10);

  logger.info('Repo metadata fetched', {
    owner,
    repo,
    languages: Object.keys(languagesData).length,
    topics: repoData.topics?.length ?? 0,
  });

  return {
    id: repoData.id,
    fullName: repoData.full_name,
    description: repoData.description,
    topics: repoData.topics ?? [],
    defaultBranch: repoData.default_branch,
    visibility: repoData.visibility ?? 'public',
    createdAt: repoData.created_at,
    updatedAt: repoData.updated_at,
    pushedAt: repoData.pushed_at,
    stargazersCount: repoData.stargazers_count,
    forksCount: repoData.forks_count,
    languages: languagesData,
    languageBreakdown,
  };
}

/**
 * Dependency files fetched from a repository.
 */
export interface DependencyFiles {
  packageJson: PackageJson | null;
  requirements: RequirementsTxt | null;
  pyproject: string[] | null;
  cargo: CargoToml | null;
  goMod: GoMod | null;
  gemfile: Gemfile | null;
  composerJson: ComposerJson | null;
}

/**
 * Fetch ONLY manifest/dependency files from a repository.
 * NEVER fetches source code files.
 */
export async function fetchDependencyFiles(
  owner: string,
  repo: string,
  ref?: string
): Promise<DependencyFiles> {
  logger.info('Fetching dependency files', { owner, repo, ref });

  // Fetch all manifest files in parallel
  const [packageJson, requirements, pyproject, cargo, goMod, gemfile, composerJson] = await Promise.all([
    fetchPackageJson(owner, repo, ref),
    fetchRequirementsTxt(owner, repo, ref),
    fetchPyprojectToml(owner, repo, ref),
    fetchCargoToml(owner, repo, ref),
    fetchGoMod(owner, repo, ref),
    fetchGemfile(owner, repo, ref),
    fetchComposerJson(owner, repo, ref),
  ]);

  const filesFound = [
    packageJson && 'package.json',
    requirements && 'requirements.txt',
    pyproject && 'pyproject.toml',
    cargo && 'Cargo.toml',
    goMod && 'go.mod',
    gemfile && 'Gemfile',
    composerJson && 'composer.json',
  ].filter(Boolean);

  logger.info('Dependency files fetched', { owner, repo, files: filesFound });

  return { packageJson, requirements, pyproject, cargo, goMod, gemfile, composerJson };
}

/**
 * Parsed dependencies for a single ecosystem.
 */
export interface EcosystemDependencies {
  ecosystem: DependencyEcosystem;
  direct: Array<{ name: string; version: string }>;
  dev: Array<{ name: string; version: string }>;
}

/**
 * All parsed dependencies from dependency files.
 */
export interface ParsedDependencies {
  ecosystems: DependencyEcosystem[];
  byEcosystem: EcosystemDependencies[];
  frameworks: FrameworkInfo[];
  keyDependencies: KeyDependency[];
  summary: {
    totalDirect: number;
    totalDev: number;
    ecosystemCount: number;
  };
}

/**
 * Parse dependencies from fetched dependency files.
 * Extracts direct + dev dependencies per ecosystem.
 */
export function parseDependencies(files: DependencyFiles): ParsedDependencies {
  logger.debug('Parsing dependencies');

  const byEcosystem: EcosystemDependencies[] = [];
  const ecosystems: DependencyEcosystem[] = [];

  // Parse npm (package.json)
  if (files.packageJson) {
    ecosystems.push('npm');
    const direct: Array<{ name: string; version: string }> = [];
    const dev: Array<{ name: string; version: string }> = [];

    for (const [name, version] of Object.entries(files.packageJson.dependencies ?? {})) {
      direct.push({ name, version: version.replace(/^[^0-9]*/, '') });
    }
    for (const [name, version] of Object.entries(files.packageJson.devDependencies ?? {})) {
      dev.push({ name, version: version.replace(/^[^0-9]*/, '') });
    }

    byEcosystem.push({ ecosystem: 'npm', direct, dev });
  }

  // Parse pip (requirements.txt + pyproject.toml)
  const pythonDeps: Array<{ name: string; version: string }> = [];
  if (files.requirements) {
    for (const pkg of files.requirements.packages) {
      pythonDeps.push({ name: pkg.name, version: pkg.version ?? 'unknown' });
    }
  }
  if (files.pyproject) {
    for (const name of files.pyproject) {
      if (!pythonDeps.find(d => d.name.toLowerCase() === name.toLowerCase())) {
        pythonDeps.push({ name, version: 'unknown' });
      }
    }
  }
  if (pythonDeps.length > 0) {
    ecosystems.push('pip');
    byEcosystem.push({ ecosystem: 'pip', direct: pythonDeps, dev: [] });
  }

  // Parse cargo (Cargo.toml)
  if (files.cargo) {
    ecosystems.push('cargo');
    const direct: Array<{ name: string; version: string }> = [];
    const dev: Array<{ name: string; version: string }> = [];

    for (const [name, version] of Object.entries(files.cargo.dependencies ?? {})) {
      const v = typeof version === 'string' ? version : version.version;
      direct.push({ name, version: v });
    }
    for (const [name, version] of Object.entries(files.cargo.devDependencies ?? {})) {
      const v = typeof version === 'string' ? version : version.version;
      dev.push({ name, version: v });
    }

    byEcosystem.push({ ecosystem: 'cargo', direct, dev });
  }

  // Parse go (go.mod)
  if (files.goMod?.require) {
    ecosystems.push('go');
    const direct = files.goMod.require.map(r => ({ name: r.path, version: r.version }));
    byEcosystem.push({ ecosystem: 'go', direct, dev: [] });
  }

  // Parse ruby (Gemfile)
  if (files.gemfile) {
    ecosystems.push('gems');
    const direct: Array<{ name: string; version: string }> = [];
    const dev: Array<{ name: string; version: string }> = [];

    for (const gem of files.gemfile.gems) {
      const dep = { name: gem.name, version: gem.version ?? 'unknown' };
      if (gem.group === 'development' || gem.group === 'test') {
        dev.push(dep);
      } else {
        direct.push(dep);
      }
    }

    byEcosystem.push({ ecosystem: 'gems', direct, dev });
  }

  // Parse composer (composer.json) - uses 'other' as ecosystem type
  if (files.composerJson) {
    ecosystems.push('other'); // composer maps to 'other' in DependencyEcosystem
    const direct: Array<{ name: string; version: string }> = [];
    const dev: Array<{ name: string; version: string }> = [];

    for (const [name, version] of Object.entries(files.composerJson.require ?? {})) {
      if (!name.startsWith('php') && !name.startsWith('ext-')) {
        direct.push({ name, version: version.replace(/^[^0-9]*/, '') });
      }
    }
    for (const [name, version] of Object.entries(files.composerJson.requireDev ?? {})) {
      dev.push({ name, version: version.replace(/^[^0-9]*/, '') });
    }

    byEcosystem.push({ ecosystem: 'other', direct, dev });
  }

  // Detect frameworks from all ecosystems
  const frameworks = detectFrameworks(files.packageJson);

  // Add Python frameworks
  for (const dep of pythonDeps) {
    const framework = FRAMEWORK_PATTERNS[dep.name.toLowerCase()];
    if (framework) {
      frameworks.push({
        name: framework.name,
        version: dep.version,
        category: framework.category as 'frontend' | 'backend' | 'styling' | 'testing' | 'build' | 'other',
      });
    }
  }

  // Extract key dependencies
  const keyDependencies = extractKeyDependencies(
    files.packageJson,
    pythonDeps.map(d => d.name)
  );

  // Calculate summary
  const totalDirect = byEcosystem.reduce((sum, e) => sum + e.direct.length, 0);
  const totalDev = byEcosystem.reduce((sum, e) => sum + e.dev.length, 0);

  logger.info('Dependencies parsed', {
    ecosystems,
    totalDirect,
    totalDev,
    frameworks: frameworks.length,
    keyDependencies: keyDependencies.length,
  });

  return {
    ecosystems,
    byEcosystem,
    frameworks,
    keyDependencies,
    summary: {
      totalDirect,
      totalDev,
      ecosystemCount: ecosystems.length,
    },
  };
}

// ============================================================
// MAIN PROVIDER FUNCTION
// ============================================================

/**
 * Fetch project profile data from a GitHub repository.
 * Returns a partial profile that can be merged with other providers.
 *
 * Uses the public API functions internally for cleaner separation.
 */
export async function fetchGitHubProjectProfile(
  input: GitHubRepoInput
): Promise<PartialProjectProfile> {
  const { owner, name, branch } = input;
  logger.info('Fetching GitHub project profile', { owner, repo: name, branch });

  // Fetch metadata first to get default branch
  const metadata = await fetchRepoMetadata(owner, name);
  const ref = branch ?? metadata.defaultBranch;

  // Fetch dependency files
  const files = await fetchDependencyFiles(owner, name, ref);

  // Parse dependencies
  const parsed = parseDependencies(files);

  // Build allDependencies summary
  const allDependencies: Record<string, { direct: number; dev: number; packages: string[] }> = {};
  for (const eco of parsed.byEcosystem) {
    allDependencies[eco.ecosystem] = {
      direct: eco.direct.length,
      dev: eco.dev.length,
      packages: eco.direct.slice(0, 10).map(d => d.name),
    };
  }

  // Build stack
  const stack: Partial<ProjectStack> = {
    languages: metadata.languageBreakdown,
    frameworks: parsed.frameworks,
    keyDependencies: parsed.keyDependencies,
    allDependencies,
  };

  logger.info('GitHub project profile fetched', {
    owner,
    repo: name,
    languages: metadata.languageBreakdown.length,
    frameworks: parsed.frameworks.length,
    ecosystems: parsed.ecosystems,
  });

  // Return partial profile
  return {
    source: 'github',
    fetchedAt: new Date().toISOString(),
    stack,
    rawMetadata: {
      repoId: metadata.id,
      fullName: metadata.fullName,
      description: metadata.description,
      topics: metadata.topics,
      defaultBranch: metadata.defaultBranch,
      visibility: metadata.visibility,
      createdAt: metadata.createdAt,
      updatedAt: metadata.updatedAt,
      pushedAt: metadata.pushedAt,
      stargazersCount: metadata.stargazersCount,
      forksCount: metadata.forksCount,
    },
    rawDependencies: files as unknown as Record<string, unknown>,
  };
}

/**
 * Fetch profiles from multiple repositories and merge them.
 */
export async function fetchMultiRepoProfile(
  repos: GitHubRepoInput[]
): Promise<PartialProjectProfile[]> {
  const profiles = await Promise.all(
    repos.map(repo => fetchGitHubProjectProfile(repo))
  );
  return profiles;
}
