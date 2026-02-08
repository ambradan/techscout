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

// ============================================================
// GITHUB CLIENT
// ============================================================

let octokit: Octokit | null = null;

function getOctokit(): Octokit {
  if (!octokit) {
    const token = process.env.GITHUB_TOKEN;
    if (!token) {
      throw new Error('GITHUB_TOKEN environment variable is required');
    }
    octokit = new Octokit({ auth: token });
  }
  return octokit;
}

// ============================================================
// DEPENDENCY FILE FETCHERS
// ============================================================

async function fetchFileContent(
  owner: string,
  repo: string,
  path: string,
  ref?: string
): Promise<string | null> {
  try {
    const client = getOctokit();
    const response = await client.rest.repos.getContent({
      owner,
      repo,
      path,
      ref,
    });

    if ('content' in response.data && response.data.type === 'file') {
      return Buffer.from(response.data.content, 'base64').toString('utf-8');
    }
    return null;
  } catch (error) {
    // File not found is not an error, just means repo doesn't have this file
    if (error && typeof error === 'object' && 'status' in error && error.status === 404) {
      return null;
    }
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
// MAIN PROVIDER FUNCTION
// ============================================================

/**
 * Fetch project profile data from a GitHub repository.
 * Returns a partial profile that can be merged with other providers.
 */
export async function fetchGitHubProjectProfile(
  input: GitHubRepoInput
): Promise<PartialProjectProfile> {
  const { owner, name, branch } = input;
  const client = getOctokit();

  // Fetch repository metadata
  const repoResponse = await client.rest.repos.get({
    owner,
    repo: name,
  });

  const repo = repoResponse.data;

  // Fetch language breakdown
  const languagesResponse = await client.rest.repos.listLanguages({
    owner,
    repo: name,
  });

  const languagesData = languagesResponse.data;
  const totalBytes = Object.values(languagesData).reduce((a, b) => a + b, 0);

  const languages: LanguageInfo[] = Object.entries(languagesData)
    .map(([lang, bytes], index) => ({
      name: lang,
      percentage: Math.round((bytes / totalBytes) * 1000) / 10,
      role: (index === 0 ? 'primary' : index === 1 ? 'secondary' : 'config') as 'primary' | 'secondary' | 'config' | 'scripting',
    }))
    .slice(0, 5); // Top 5 languages

  // Fetch dependency files in parallel
  const ref = branch ?? repo.default_branch;

  const [packageJson, requirements, pyproject, cargo, goMod] = await Promise.all([
    fetchPackageJson(owner, name, ref),
    fetchRequirementsTxt(owner, name, ref),
    fetchPyprojectToml(owner, name, ref),
    fetchCargoToml(owner, name, ref),
    fetchGoMod(owner, name, ref),
  ]);

  // Determine ecosystems present
  const ecosystems: DependencyEcosystem[] = [];
  if (packageJson) ecosystems.push('npm');
  if (requirements || pyproject) ecosystems.push('pip');
  if (cargo) ecosystems.push('cargo');
  if (goMod) ecosystems.push('go');

  // Detect frameworks
  const frameworks = detectFrameworks(packageJson);

  // Collect all Python packages
  const pythonPackages: string[] = [
    ...(requirements?.packages.map(p => p.name) ?? []),
    ...(pyproject ?? []),
  ];

  // Add Python frameworks
  for (const pkg of pythonPackages) {
    const framework = FRAMEWORK_PATTERNS[pkg.toLowerCase()];
    if (framework) {
      frameworks.push({
        name: framework.name,
        version: 'unknown',
        category: framework.category as 'frontend' | 'backend' | 'styling' | 'testing' | 'build' | 'other',
      });
    }
  }

  // Extract key dependencies
  const keyDependencies = extractKeyDependencies(packageJson, pythonPackages);

  // Calculate dependency counts
  const npmDeps = packageJson ? {
    direct: Object.keys(packageJson.dependencies ?? {}).length,
    dev: Object.keys(packageJson.devDependencies ?? {}).length,
    packages: Object.keys(packageJson.dependencies ?? {}).slice(0, 10),
  } : undefined;

  const pipDeps = pythonPackages.length > 0 ? {
    direct: pythonPackages.length,
    dev: 0,
    packages: pythonPackages.slice(0, 10),
  } : undefined;

  const cargoDeps = cargo?.dependencies ? {
    direct: Object.keys(cargo.dependencies).length,
    dev: Object.keys(cargo.devDependencies ?? {}).length,
    packages: Object.keys(cargo.dependencies).slice(0, 10),
  } : undefined;

  const goDeps = goMod?.require ? {
    direct: goMod.require.length,
    dev: 0,
    packages: goMod.require.map(r => r.path).slice(0, 10),
  } : undefined;

  // Build stack
  const stack: Partial<ProjectStack> = {
    languages,
    frameworks,
    keyDependencies,
    allDependencies: {
      ...(npmDeps && { npm: npmDeps }),
      ...(pipDeps && { pip: pipDeps }),
      ...(cargoDeps && { cargo: cargoDeps }),
      ...(goDeps && { go: goDeps }),
    },
  };

  // Return partial profile
  return {
    source: 'github',
    fetchedAt: new Date().toISOString(),
    stack,
    rawMetadata: {
      repoId: repo.id,
      fullName: repo.full_name,
      description: repo.description,
      topics: repo.topics,
      defaultBranch: repo.default_branch,
      visibility: repo.visibility,
      createdAt: repo.created_at,
      updatedAt: repo.updated_at,
      pushedAt: repo.pushed_at,
      stargazersCount: repo.stargazers_count,
      forksCount: repo.forks_count,
    },
    rawDependencies: {
      packageJson,
      requirements,
      pyproject,
      cargo,
      goMod,
    },
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
