/**
 * TechScout — Agent Backup Module (Layer 6)
 *
 * Creates backup branch and commits before any modifications.
 * Ensures we can always recover the pre-modification state.
 *
 * CRITICAL: Backup MUST be committed BEFORE any changes are made.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { logger } from '../lib/logger';
import type { BackupInfo, AgentGitConfig } from '../types';
import { isProtectedBranch, generateSafeBranchName } from './safety';

const execAsync = promisify(exec);

// ============================================================
// TYPES
// ============================================================

export interface BackupOptions {
  workingDir: string;
  gitConfig: AgentGitConfig;
  recommendationId: string;
  subject: string;
  jobId: string;
}

export interface BackupResult {
  success: boolean;
  backup?: BackupInfo;
  error?: string;
}

// ============================================================
// GIT HELPERS
// ============================================================

/**
 * Execute a git command in the working directory.
 */
async function git(
  workingDir: string,
  command: string
): Promise<{ stdout: string; stderr: string }> {
  const fullCommand = `git ${command}`;
  logger.debug('Executing git command', { command: fullCommand, workingDir });

  try {
    const result = await execAsync(fullCommand, {
      cwd: workingDir,
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer
    });
    return result;
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string; message: string };
    logger.error('Git command failed', {
      command: fullCommand,
      error: err.message,
      stderr: err.stderr,
    });
    throw error;
  }
}

/**
 * Get the current branch name.
 */
async function getCurrentBranch(workingDir: string): Promise<string> {
  const { stdout } = await git(workingDir, 'rev-parse --abbrev-ref HEAD');
  return stdout.trim();
}

/**
 * Get the current commit SHA.
 */
async function getCurrentSha(workingDir: string): Promise<string> {
  const { stdout } = await git(workingDir, 'rev-parse HEAD');
  return stdout.trim();
}

/**
 * Check if working directory is clean.
 */
async function isWorkingDirClean(workingDir: string): Promise<boolean> {
  const { stdout } = await git(workingDir, 'status --porcelain');
  return stdout.trim() === '';
}

/**
 * Check if a branch exists locally.
 */
async function branchExists(workingDir: string, branchName: string): Promise<boolean> {
  try {
    await git(workingDir, `rev-parse --verify ${branchName}`);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if a branch exists on remote.
 */
async function remoteBranchExists(
  workingDir: string,
  remote: string,
  branchName: string
): Promise<boolean> {
  try {
    const { stdout } = await git(workingDir, `ls-remote --heads ${remote} ${branchName}`);
    return stdout.trim() !== '';
  } catch {
    return false;
  }
}

// ============================================================
// BACKUP OPERATIONS
// ============================================================

/**
 * Create a backup branch from the current state.
 */
export async function createBackup(options: BackupOptions): Promise<BackupResult> {
  const { workingDir, gitConfig, recommendationId, subject, jobId } = options;

  logger.info('Creating backup', {
    workingDir,
    recommendationId,
    jobId,
  });

  try {
    // Validate current branch is not protected
    const currentBranch = await getCurrentBranch(workingDir);

    if (isProtectedBranch(currentBranch)) {
      return {
        success: false,
        error: `Cannot create backup from protected branch: ${currentBranch}`,
      };
    }

    // Check working directory is clean
    const isClean = await isWorkingDirClean(workingDir);
    if (!isClean) {
      return {
        success: false,
        error: 'Working directory has uncommitted changes. Please commit or stash first.',
      };
    }

    // Get current SHA before any changes
    const currentSha = await getCurrentSha(workingDir);

    // Generate backup branch name
    const backupBranchName = generateSafeBranchName(
      gitConfig.branchPrefix,
      recommendationId,
      subject
    );

    // Check if branch already exists
    if (await branchExists(workingDir, backupBranchName)) {
      return {
        success: false,
        error: `Branch already exists: ${backupBranchName}`,
      };
    }

    // Create and checkout the new branch
    await git(workingDir, `checkout -b ${backupBranchName}`);

    // Create initial backup commit (empty commit to mark starting point)
    const backupMessage = `[TechScout] Backup before migration

Job ID: ${jobId}
Recommendation: ${recommendationId}
Subject: ${subject}
Created from: ${currentBranch} @ ${currentSha.slice(0, 8)}

This commit marks the starting point for the migration.
The working tree state at this commit matches the base branch.`;

    await git(workingDir, `commit --allow-empty -m "${backupMessage.replace(/"/g, '\\"')}"`);

    // Get the backup commit SHA
    const backupCommitSha = await getCurrentSha(workingDir);

    // Push to remote if configured
    let pushed = false;
    if (gitConfig.autoPush) {
      try {
        await git(workingDir, `push -u origin ${backupBranchName}`);
        pushed = true;
        logger.info('Backup branch pushed to remote', { branchName: backupBranchName });
      } catch (pushError) {
        logger.warn('Failed to push backup branch', {
          error: pushError instanceof Error ? pushError.message : String(pushError),
        });
        // Continue without push - local backup is still valid
      }
    }

    const backup: BackupInfo = {
      branchName: backupBranchName,
      createdFrom: currentBranch,
      createdFromSha: currentSha,
      backupCommitSha,
      backupCommitMessage: backupMessage,
      createdAt: new Date().toISOString(),
      pushed,
    };

    logger.info('Backup created successfully', {
      branchName: backupBranchName,
      backupSha: backupCommitSha.slice(0, 8),
      pushed,
    });

    return { success: true, backup };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('Backup creation failed', { error: errorMsg });
    return { success: false, error: errorMsg };
  }
}

/**
 * Verify that backup is intact.
 */
export async function verifyBackup(
  workingDir: string,
  backup: BackupInfo
): Promise<{ valid: boolean; reason?: string }> {
  try {
    // Check branch exists
    const exists = await branchExists(workingDir, backup.branchName);
    if (!exists) {
      return { valid: false, reason: 'Backup branch no longer exists' };
    }

    // Verify the backup commit
    const { stdout } = await git(workingDir, `rev-parse ${backup.branchName}~0`);
    const currentSha = stdout.trim();

    // The backup branch should have at least the backup commit
    // (more commits may have been added during migration)
    try {
      await git(workingDir, `merge-base --is-ancestor ${backup.backupCommitSha} ${backup.branchName}`);
    } catch {
      return {
        valid: false,
        reason: 'Backup commit is not in branch history',
      };
    }

    return { valid: true };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return { valid: false, reason: errorMsg };
  }
}

/**
 * Rollback to backup state.
 */
export async function rollbackToBackup(
  workingDir: string,
  backup: BackupInfo
): Promise<{ success: boolean; error?: string }> {
  logger.info('Rolling back to backup', {
    backupBranch: backup.branchName,
    backupSha: backup.backupCommitSha.slice(0, 8),
  });

  try {
    // Verify backup first
    const verification = await verifyBackup(workingDir, backup);
    if (!verification.valid) {
      return { success: false, error: verification.reason };
    }

    // Hard reset to backup commit
    await git(workingDir, `reset --hard ${backup.backupCommitSha}`);

    logger.info('Rollback successful', {
      backupSha: backup.backupCommitSha.slice(0, 8),
    });

    return { success: true };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('Rollback failed', { error: errorMsg });
    return { success: false, error: errorMsg };
  }
}

/**
 * Get diff stats between backup and current state.
 */
export async function getBackupDiff(
  workingDir: string,
  backup: BackupInfo
): Promise<{
  filesChanged: number;
  insertions: number;
  deletions: number;
}> {
  try {
    const { stdout } = await git(
      workingDir,
      `diff --stat ${backup.backupCommitSha}...HEAD`
    );

    // Parse the diff --stat output
    const lines = stdout.trim().split('\n');
    const summaryLine = lines[lines.length - 1];

    // Example: " 3 files changed, 45 insertions(+), 12 deletions(-)"
    const filesMatch = summaryLine.match(/(\d+) files? changed/);
    const insertionsMatch = summaryLine.match(/(\d+) insertions?/);
    const deletionsMatch = summaryLine.match(/(\d+) deletions?/);

    return {
      filesChanged: filesMatch ? parseInt(filesMatch[1]) : 0,
      insertions: insertionsMatch ? parseInt(insertionsMatch[1]) : 0,
      deletions: deletionsMatch ? parseInt(deletionsMatch[1]) : 0,
    };
  } catch {
    return { filesChanged: 0, insertions: 0, deletions: 0 };
  }
}

/**
 * Commit current changes to the backup branch.
 */
export async function commitChanges(
  workingDir: string,
  message: string,
  backup: BackupInfo
): Promise<{ success: boolean; commitSha?: string; error?: string }> {
  try {
    // Verify we're on the right branch
    const currentBranch = await getCurrentBranch(workingDir);
    if (currentBranch !== backup.branchName) {
      return {
        success: false,
        error: `Not on backup branch. Expected: ${backup.branchName}, Got: ${currentBranch}`,
      };
    }

    // Stage all changes
    await git(workingDir, 'add -A');

    // Check if there are changes to commit
    const isClean = await isWorkingDirClean(workingDir);
    if (isClean) {
      return { success: true }; // Nothing to commit
    }

    // Commit
    await git(workingDir, `commit -m "${message.replace(/"/g, '\\"')}"`);

    const commitSha = await getCurrentSha(workingDir);

    logger.info('Changes committed', {
      commitSha: commitSha.slice(0, 8),
      branch: backup.branchName,
    });

    return { success: true, commitSha };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('Commit failed', { error: errorMsg });
    return { success: false, error: errorMsg };
  }
}

/**
 * Push backup branch to remote.
 */
export async function pushBackup(
  workingDir: string,
  backup: BackupInfo,
  remote: string = 'origin'
): Promise<{ success: boolean; error?: string }> {
  try {
    await git(workingDir, `push ${remote} ${backup.branchName}`);

    logger.info('Backup pushed to remote', {
      branch: backup.branchName,
      remote,
    });

    return { success: true };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('Push failed', { error: errorMsg });
    return { success: false, error: errorMsg };
  }
}

/**
 * Clean up backup branch (only after successful merge).
 */
export async function cleanupBackupBranch(
  workingDir: string,
  backup: BackupInfo,
  gitConfig: AgentGitConfig
): Promise<{ success: boolean; error?: string }> {
  logger.info('Cleaning up backup branch', { branchName: backup.branchName });

  try {
    // Switch to base branch first
    await git(workingDir, `checkout ${gitConfig.baseBranch}`);

    // Delete local branch
    await git(workingDir, `branch -D ${backup.branchName}`);

    // Delete remote branch if it was pushed
    if (backup.pushed) {
      try {
        await git(workingDir, `push origin --delete ${backup.branchName}`);
      } catch {
        logger.warn('Could not delete remote branch', {
          branchName: backup.branchName,
        });
      }
    }

    logger.info('Backup branch cleaned up', { branchName: backup.branchName });

    return { success: true };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('Cleanup failed', { error: errorMsg });
    return { success: false, error: errorMsg };
  }
}
