/**
 * TechScout — Webhook Server Tests
 *
 * Tests for:
 * - GitHub signature verification (HMAC SHA-256)
 * - Manifest file detection
 * - Webhook endpoint behavior
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import crypto from 'crypto';
import request from 'supertest';
import { verifyGitHubSignature, getModifiedManifestFiles, app } from '../src/server/webhook';

// ============================================================
// SIGNATURE VERIFICATION TESTS
// ============================================================

describe('verifyGitHubSignature', () => {
  const secret = 'test-webhook-secret';

  it('should return true for valid signature', () => {
    const payload = '{"test": "data"}';
    const hmac = crypto.createHmac('sha256', secret);
    const digest = hmac.update(payload).digest('hex');
    const signature = `sha256=${digest}`;

    expect(verifyGitHubSignature(payload, signature, secret)).toBe(true);
  });

  it('should return false for invalid signature', () => {
    const payload = '{"test": "data"}';
    const signature = 'sha256=invalidsignature1234567890abcdef1234567890abcdef1234567890abcdef';

    expect(verifyGitHubSignature(payload, signature, secret)).toBe(false);
  });

  it('should return false for missing signature', () => {
    const payload = '{"test": "data"}';

    expect(verifyGitHubSignature(payload, undefined, secret)).toBe(false);
  });

  it('should return false for malformed signature', () => {
    const payload = '{"test": "data"}';

    expect(verifyGitHubSignature(payload, 'notsha256=something', secret)).toBe(false);
    expect(verifyGitHubSignature(payload, 'sha256', secret)).toBe(false);
    expect(verifyGitHubSignature(payload, '=abc', secret)).toBe(false);
  });

  it('should return false for tampered payload', () => {
    const originalPayload = '{"test": "data"}';
    const tamperedPayload = '{"test": "tampered"}';

    const hmac = crypto.createHmac('sha256', secret);
    const digest = hmac.update(originalPayload).digest('hex');
    const signature = `sha256=${digest}`;

    expect(verifyGitHubSignature(tamperedPayload, signature, secret)).toBe(false);
  });

  it('should return false for wrong secret', () => {
    const payload = '{"test": "data"}';
    const hmac = crypto.createHmac('sha256', secret);
    const digest = hmac.update(payload).digest('hex');
    const signature = `sha256=${digest}`;

    expect(verifyGitHubSignature(payload, signature, 'wrong-secret')).toBe(false);
  });
});

// ============================================================
// MANIFEST FILE DETECTION TESTS
// ============================================================

describe('getModifiedManifestFiles', () => {
  it('should detect modified package.json', () => {
    const commits = [
      {
        id: 'abc123',
        message: 'Update deps',
        modified: ['package.json'],
      },
    ];

    const result = getModifiedManifestFiles(commits);
    expect(result).toEqual(['package.json']);
  });

  it('should detect multiple manifest files across commits', () => {
    const commits = [
      {
        id: 'abc123',
        message: 'Update npm deps',
        modified: ['package.json', 'src/index.ts'],
      },
      {
        id: 'def456',
        message: 'Add python deps',
        added: ['requirements.txt'],
      },
    ];

    const result = getModifiedManifestFiles(commits);
    expect(result).toContain('package.json');
    expect(result).toContain('requirements.txt');
    expect(result).toHaveLength(2);
  });

  it('should handle nested manifest files', () => {
    const commits = [
      {
        id: 'abc123',
        message: 'Update backend deps',
        modified: ['backend/package.json', 'frontend/package.json'],
      },
    ];

    const result = getModifiedManifestFiles(commits);
    expect(result).toContain('backend/package.json');
    expect(result).toContain('frontend/package.json');
  });

  it('should ignore non-manifest files', () => {
    const commits = [
      {
        id: 'abc123',
        message: 'Code changes',
        modified: ['src/index.ts', 'README.md', 'src/utils.ts'],
      },
    ];

    const result = getModifiedManifestFiles(commits);
    expect(result).toHaveLength(0);
  });

  it('should detect all supported manifest types', () => {
    const commits = [
      {
        id: 'abc123',
        message: 'Multi-ecosystem update',
        modified: [
          'package.json',
          'requirements.txt',
          'Cargo.toml',
          'go.mod',
          'Gemfile',
          'composer.json',
        ],
      },
    ];

    const result = getModifiedManifestFiles(commits);
    expect(result).toHaveLength(6);
  });

  it('should handle removed manifest files', () => {
    const commits = [
      {
        id: 'abc123',
        message: 'Remove old deps',
        removed: ['old/package.json'],
      },
    ];

    const result = getModifiedManifestFiles(commits);
    expect(result).toContain('old/package.json');
  });

  it('should deduplicate files modified in multiple commits', () => {
    const commits = [
      {
        id: 'abc123',
        message: 'First change',
        modified: ['package.json'],
      },
      {
        id: 'def456',
        message: 'Second change',
        modified: ['package.json'],
      },
    ];

    const result = getModifiedManifestFiles(commits);
    expect(result).toEqual(['package.json']);
  });

  it('should handle empty commits array', () => {
    const result = getModifiedManifestFiles([]);
    expect(result).toHaveLength(0);
  });

  it('should handle commits with undefined file arrays', () => {
    const commits = [
      {
        id: 'abc123',
        message: 'Empty commit',
        // No added, modified, or removed
      },
    ];

    const result = getModifiedManifestFiles(commits);
    expect(result).toHaveLength(0);
  });
});

// ============================================================
// HTTP ENDPOINT TESTS
// ============================================================

describe('Webhook HTTP Endpoints', () => {
  // Set mock secret for tests
  beforeAll(() => {
    process.env.GITHUB_WEBHOOK_SECRET = 'test-secret';
  });

  afterAll(() => {
    delete process.env.GITHUB_WEBHOOK_SECRET;
  });

  describe('GET /health', () => {
    it('should return healthy status', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body.status).toBe('healthy');
      expect(response.body.service).toBe('techscout-webhook');
      expect(response.body.timestamp).toBeDefined();
    });
  });

  describe('POST /webhooks/github', () => {
    const createSignature = (payload: string, secret: string): string => {
      const hmac = crypto.createHmac('sha256', secret);
      return `sha256=${hmac.update(payload).digest('hex')}`;
    };

    it('should reject request without signature', async () => {
      const response = await request(app)
        .post('/webhooks/github')
        .send({ test: 'data' })
        .expect(401);

      expect(response.body.error).toBe('Invalid signature');
    });

    it('should reject request with invalid signature', async () => {
      const response = await request(app)
        .post('/webhooks/github')
        .set('x-hub-signature-256', 'sha256=invalid')
        .send({ test: 'data' })
        .expect(401);

      expect(response.body.error).toBe('Invalid signature');
    });

    it('should ignore non-push events', async () => {
      const payload = JSON.stringify({ action: 'opened' });
      const signature = createSignature(payload, 'test-secret');

      const response = await request(app)
        .post('/webhooks/github')
        .set('x-hub-signature-256', signature)
        .set('x-github-event', 'pull_request')
        .set('Content-Type', 'application/json')
        .send(payload)
        .expect(200);

      expect(response.body.message).toBe('Event ignored');
      expect(response.body.event).toBe('pull_request');
    });

    it('should handle push with no manifest changes', async () => {
      const payload = JSON.stringify({
        ref: 'refs/heads/main',
        repository: {
          id: 123,
          full_name: 'test/repo',
          name: 'repo',
          owner: { login: 'test' },
          clone_url: 'https://github.com/test/repo.git',
          html_url: 'https://github.com/test/repo',
        },
        commits: [
          {
            id: 'abc123',
            message: 'Code update',
            modified: ['src/index.ts'],
          },
        ],
        sender: { login: 'user' },
      });

      const signature = createSignature(payload, 'test-secret');

      const response = await request(app)
        .post('/webhooks/github')
        .set('x-hub-signature-256', signature)
        .set('x-github-event', 'push')
        .set('Content-Type', 'application/json')
        .send(payload)
        .expect(200);

      expect(response.body.message).toBe('No manifest changes detected');
    });

    it('should detect manifest changes and return no-project response', async () => {
      const payload = JSON.stringify({
        ref: 'refs/heads/main',
        repository: {
          id: 123,
          full_name: 'unknown/repo',
          name: 'repo',
          owner: { login: 'unknown' },
          clone_url: 'https://github.com/unknown/repo.git',
          html_url: 'https://github.com/unknown/repo',
        },
        commits: [
          {
            id: 'abc123',
            message: 'Update deps',
            modified: ['package.json'],
          },
        ],
        sender: { login: 'user' },
      });

      const signature = createSignature(payload, 'test-secret');

      const response = await request(app)
        .post('/webhooks/github')
        .set('x-hub-signature-256', signature)
        .set('x-github-event', 'push')
        .set('Content-Type', 'application/json')
        .send(payload)
        .expect(200);

      // Will return "No associated projects" since test repo isn't in DB
      expect(response.body.message).toBe('No associated projects');
    });
  });
});
