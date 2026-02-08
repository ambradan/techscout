/**
 * Tests for Agent Safety Module
 *
 * CRITICAL: These tests verify the NON-NEGOTIABLE safety constraints
 */

import { describe, it, expect } from 'vitest';
import {
  getDefaultSafetyLimits,
  isPathForbidden,
  containsForbiddenOperation,
  validatePlan,
  performSafetyCheck,
  shouldTriggerSafetyStop,
  isProtectedBranch,
  generateSafeBranchName,
  createTimeoutChecker,
  validatePlanStep,
  createSafetyStop,
  createSafeCompletion,
} from '../../src/agent/safety';
import type { PlanStep, SafetyCheck, AgentSafetyLimits } from '../../src/types';

describe('Agent Safety Module', () => {
  describe('getDefaultSafetyLimits', () => {
    it('should return reasonable default limits', () => {
      const limits = getDefaultSafetyLimits();

      expect(limits.maxFilesModified).toBeGreaterThan(0);
      expect(limits.maxFilesModified).toBeLessThanOrEqual(100);
      expect(limits.maxLinesChanged).toBeGreaterThan(0);
      expect(limits.maxExecutionTimeMinutes).toBeGreaterThan(0);
      expect(limits.complexityThreshold).toBeGreaterThan(1);
    });

    it('should include critical forbidden paths', () => {
      const limits = getDefaultSafetyLimits();

      expect(limits.forbiddenPaths.some(p => p.includes('.env'))).toBe(true);
      expect(limits.forbiddenPaths.some(p => p.includes('secret'))).toBe(true);
    });

    it('should include critical forbidden operations', () => {
      const limits = getDefaultSafetyLimits();

      expect(limits.forbiddenOperations).toContain('rm -rf');
      expect(limits.forbiddenOperations.some(op => op.includes('drop'))).toBe(true);
    });
  });

  describe('isPathForbidden', () => {
    const forbiddenPaths = ['.env', '.env.*', '**/secrets/**', '*.pem', '*.key'];

    it('should block exact .env file', () => {
      expect(isPathForbidden('.env', forbiddenPaths)).toBe(true);
    });

    it('should block .env.local with wildcard pattern', () => {
      expect(isPathForbidden('.env.local', forbiddenPaths)).toBe(true);
      expect(isPathForbidden('.env.production', forbiddenPaths)).toBe(true);
    });

    it('should block secrets directory', () => {
      // Pattern **/secrets/** matches paths containing /secrets/
      const secretPaths = ['.env', '.env.*', 'secrets/', '**/secrets/**', '*.pem', '*.key'];
      expect(isPathForbidden('secrets/api.key', secretPaths)).toBe(true);
    });

    it('should block private key files', () => {
      expect(isPathForbidden('server.pem', forbiddenPaths)).toBe(true);
      expect(isPathForbidden('private.key', forbiddenPaths)).toBe(true);
    });

    it('should allow safe paths', () => {
      expect(isPathForbidden('src/app.ts', forbiddenPaths)).toBe(false);
      expect(isPathForbidden('package.json', forbiddenPaths)).toBe(false);
      expect(isPathForbidden('README.md', forbiddenPaths)).toBe(false);
    });
  });

  describe('containsForbiddenOperation', () => {
    const forbiddenOps = ['rm -rf', 'drop database', 'truncate', 'chmod 777'];

    it('should detect rm -rf', () => {
      expect(containsForbiddenOperation('rm -rf /', forbiddenOps)).toBe('rm -rf');
      expect(containsForbiddenOperation('rm -rf node_modules', forbiddenOps)).toBe('rm -rf');
    });

    it('should detect SQL DROP commands', () => {
      expect(containsForbiddenOperation('DROP DATABASE users', forbiddenOps)).toBe('drop database');
    });

    it('should be case-insensitive', () => {
      expect(containsForbiddenOperation('DROP DATABASE users', forbiddenOps)).toBe('drop database');
      expect(containsForbiddenOperation('TRUNCATE TABLE foo', forbiddenOps)).toBe('truncate');
    });

    it('should allow safe operations', () => {
      expect(containsForbiddenOperation('npm install', forbiddenOps)).toBeNull();
      expect(containsForbiddenOperation('git commit -m "test"', forbiddenOps)).toBeNull();
    });
  });

  describe('validatePlan', () => {
    const limits = getDefaultSafetyLimits();

    const createStep = (overrides?: Partial<PlanStep>): PlanStep => ({
      step: 1,
      action: 'Test action',
      command: 'npm test',
      filesAffected: ['src/test.ts'],
      risk: 'low',
      expected: 'Tests pass',
      ...overrides,
    });

    it('should validate a plan within limits', () => {
      const steps = [createStep()];
      const result = validatePlan(steps, 5, 100, limits);

      expect(result.valid).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should reject plan exceeding file limit', () => {
      const steps = [createStep()];
      const result = validatePlan(steps, 200, 100, limits);

      expect(result.valid).toBe(false);
      expect(result.violations.some(v => v.includes('files'))).toBe(true);
    });

    it('should reject plan exceeding lines limit', () => {
      const steps = [createStep()];
      const result = validatePlan(steps, 5, 100000, limits);

      expect(result.valid).toBe(false);
      expect(result.violations.some(v => v.includes('lines'))).toBe(true);
    });

    it('should reject plan with forbidden paths', () => {
      const steps = [createStep({ filesAffected: ['.env'] })];
      const result = validatePlan(steps, 1, 10, limits);

      expect(result.valid).toBe(false);
      expect(result.violations.some(v => v.includes('forbidden'))).toBe(true);
    });

    it('should reject plan with forbidden operations', () => {
      const steps = [createStep({ command: 'rm -rf /' })];
      const result = validatePlan(steps, 1, 10, limits);

      expect(result.valid).toBe(false);
      expect(result.violations.some(v => v.includes('forbidden'))).toBe(true);
    });
  });

  describe('validatePlanStep', () => {
    const limits = getDefaultSafetyLimits();

    it('should validate a safe step', () => {
      const step: PlanStep = {
        step: 1,
        action: 'Run tests',
        command: 'npm test',
        filesAffected: ['src/app.ts'],
        risk: 'low',
        expected: 'Tests pass',
      };

      const result = validatePlanStep(step, limits);
      expect(result.valid).toBe(true);
    });

    it('should reject step with forbidden path', () => {
      const step: PlanStep = {
        step: 1,
        action: 'Modify env',
        command: 'echo test',
        filesAffected: ['.env'],
        risk: 'high',
        expected: 'Env updated',
      };

      const result = validatePlanStep(step, limits);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('forbidden path');
    });
  });

  describe('performSafetyCheck', () => {
    const limits = getDefaultSafetyLimits();

    it('should pass for safe execution', () => {
      const check = performSafetyCheck(
        10,    // filesModified
        500,   // linesChanged
        [],    // forbiddenPathsTouched
        [],    // forbiddenOpsAttempted
        15,    // estimatedComplexity
        10,    // actualComplexity
        limits
      );

      expect(check.allWithinLimits).toBe(true);
      expect(check.filesModified).toBe(10);
      expect(check.linesChanged).toBe(500);
    });

    it('should fail when files exceed limit', () => {
      const check = performSafetyCheck(
        200,   // exceeds default
        500,
        [],
        [],
        15,
        10,
        limits
      );

      expect(check.allWithinLimits).toBe(false);
    });

    it('should calculate complexity ratio correctly', () => {
      const check = performSafetyCheck(
        10,
        500,
        [],
        [],
        10,    // estimated
        20,    // actual (2x)
        limits
      );

      expect(check.complexityRatio).toBe(2.0);
    });

    it('should fail when forbidden paths touched', () => {
      const check = performSafetyCheck(
        5,
        100,
        ['.env'],  // forbidden path touched
        [],
        10,
        10,
        limits
      );

      expect(check.allWithinLimits).toBe(false);
      expect(check.forbiddenPathsTouched).toBe(1);
    });
  });

  describe('shouldTriggerSafetyStop', () => {
    const limits = getDefaultSafetyLimits();

    it('should not stop for passing check with passing tests', () => {
      const check: SafetyCheck = {
        filesModified: 10,
        filesLimit: 50,
        linesChanged: 500,
        linesLimit: 5000,
        forbiddenPathsTouched: 0,
        forbiddenOperationsAttempted: 0,
        complexityRatio: 1.0,
        complexityLimit: 2.0,
        allWithinLimits: true,
      };

      const result = shouldTriggerSafetyStop(check, true, limits);
      expect(result.stop).toBe(false);
    });

    it('should stop for failing tests when required', () => {
      const check: SafetyCheck = {
        filesModified: 10,
        filesLimit: 50,
        linesChanged: 500,
        linesLimit: 5000,
        forbiddenPathsTouched: 0,
        forbiddenOperationsAttempted: 0,
        complexityRatio: 1.0,
        complexityLimit: 2.0,
        allWithinLimits: true,
      };

      const limitsRequireTests = { ...limits, requireTestsPass: true };
      const result = shouldTriggerSafetyStop(check, false, limitsRequireTests);

      expect(result.stop).toBe(true);
      expect(result.reason).toBe('tests_failed');
    });

    it('should stop for high complexity', () => {
      const check: SafetyCheck = {
        filesModified: 10,
        filesLimit: 50,
        linesChanged: 500,
        linesLimit: 5000,
        forbiddenPathsTouched: 0,
        forbiddenOperationsAttempted: 0,
        complexityRatio: 3.0,  // exceeds 2x threshold
        complexityLimit: 2.0,
        allWithinLimits: false,
      };

      const result = shouldTriggerSafetyStop(check, true, limits);

      expect(result.stop).toBe(true);
      expect(result.reason).toBe('complexity_exceeded');
    });

    it('should stop for forbidden path access', () => {
      const check: SafetyCheck = {
        filesModified: 10,
        filesLimit: 50,
        linesChanged: 500,
        linesLimit: 5000,
        forbiddenPathsTouched: 1,
        forbiddenOperationsAttempted: 0,
        complexityRatio: 1.0,
        complexityLimit: 2.0,
        allWithinLimits: false,
      };

      const result = shouldTriggerSafetyStop(check, true, limits);

      expect(result.stop).toBe(true);
      expect(result.reason).toBe('forbidden_path_access');
    });
  });

  describe('isProtectedBranch', () => {
    it('should protect main/master branches', () => {
      expect(isProtectedBranch('main')).toBe(true);
      expect(isProtectedBranch('master')).toBe(true);
    });

    it('should protect production branches', () => {
      expect(isProtectedBranch('production')).toBe(true);
      expect(isProtectedBranch('prod')).toBe(true);
    });

    it('should allow feature branches', () => {
      expect(isProtectedBranch('feature/new-feature')).toBe(false);
      expect(isProtectedBranch('techscout/migration-123')).toBe(false);
    });

    it('should be case-insensitive', () => {
      expect(isProtectedBranch('MAIN')).toBe(true);
      expect(isProtectedBranch('Master')).toBe(true);
    });
  });

  describe('generateSafeBranchName', () => {
    it('should generate branch with prefix', () => {
      const branch = generateSafeBranchName('migration', 'rec-12345678', 'lodash');
      expect(branch).toMatch(/^migration\//);
    });

    it('should include sanitized subject', () => {
      const branch = generateSafeBranchName('migration', 'rec-123', 'lodash');
      expect(branch).toContain('lodash');
    });

    it('should sanitize special characters', () => {
      const branch = generateSafeBranchName('migration', 'rec-123', '@scope/package');
      expect(branch).not.toContain('@');
      expect(branch).not.toContain('/package');
    });

    it('should be a valid git branch name', () => {
      const branch = generateSafeBranchName('migration', 'rec-123', 'test');
      // Git branch names can't have spaces, ~, ^, :, ?, *, [
      expect(branch).not.toMatch(/[\s~^:?*\[]/);
    });

    it('should include part of recommendation ID', () => {
      const branch = generateSafeBranchName('migration', 'rec-abcd1234', 'lodash');
      expect(branch).toContain('abcd1234');
    });
  });

  describe('createTimeoutChecker', () => {
    it('should not be expired immediately', () => {
      const checker = createTimeoutChecker(new Date(), 30);
      expect(checker.isExpired()).toBe(false);
    });

    it('should report remaining time in milliseconds', () => {
      const checker = createTimeoutChecker(new Date(), 30);
      const remaining = checker.remainingMs();
      expect(remaining).toBeLessThanOrEqual(30 * 60 * 1000);
      expect(remaining).toBeGreaterThan(29 * 60 * 1000);
    });

    it('should be expired after time limit', () => {
      const pastDate = new Date(Date.now() - 31 * 60 * 1000); // 31 minutes ago
      const checker = createTimeoutChecker(pastDate, 30);
      expect(checker.isExpired()).toBe(true);
    });

    it('should return 0 remaining when expired', () => {
      const pastDate = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago
      const checker = createTimeoutChecker(pastDate, 30);
      expect(checker.remainingMs()).toBe(0);
    });
  });

  describe('createSafetyStop', () => {
    it('should create a stop record with reason', () => {
      const stop = createSafetyStop('complexity_exceeded', 5, 'techscout/branch-123');

      expect(stop.triggered).toBe(true);
      expect(stop.triggerReason).toBe('complexity_exceeded');
      expect(stop.triggerAtStep).toBe(5);
      expect(stop.partialBranch).toBe('techscout/branch-123');
      expect(stop.recoveryOptions.length).toBeGreaterThan(0);
    });

    it('should include recovery options', () => {
      const stop = createSafetyStop('tests_failed');
      expect(stop.recoveryOptions.length).toBeGreaterThan(0);
    });
  });

  describe('createSafeCompletion', () => {
    it('should create a non-triggered stop', () => {
      const stop = createSafeCompletion();

      expect(stop.triggered).toBe(false);
      expect(stop.partialWorkCommitted).toBe(false);
    });
  });
});
