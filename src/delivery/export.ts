/**
 * TechScout — Export Module (Layer 4)
 *
 * Exports briefs to various formats: JSON, Markdown, PDF.
 * Archives exports to database for retrieval.
 */

import { logger } from '../lib/logger';
import { supabase } from '../db/client';
import type { TechnicalBrief } from './technical-brief';
import type { HumanBrief } from './human-brief';
import { renderTechnicalBriefMarkdown } from './technical-brief';
import { renderHumanBriefMarkdown } from './human-brief';

// ============================================================
// TYPES
// ============================================================

export type ExportFormat = 'json' | 'markdown' | 'pdf';
export type BriefType = 'technical' | 'human';

export interface ExportOptions {
  format: ExportFormat;
  includeMetadata?: boolean;
  archive?: boolean;
  filename?: string;
}

export interface ExportResult {
  success: boolean;
  format: ExportFormat;
  content: string;
  contentType: string;
  filename: string;
  size: number;
  archiveId?: string;
  error?: string;
  exportedAt: string;
}

export interface ArchivedBrief {
  id: string;
  projectId: string;
  briefType: BriefType;
  format: ExportFormat;
  content: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

// ============================================================
// JSON EXPORT
// ============================================================

/**
 * Export technical brief as JSON.
 */
export function exportTechnicalBriefAsJson(
  brief: TechnicalBrief,
  options?: { includeMetadata?: boolean }
): string {
  const output: Record<string, unknown> = {
    ...brief,
  };

  if (options?.includeMetadata) {
    output._metadata = {
      exportedAt: new Date().toISOString(),
      format: 'json',
      briefType: 'technical',
      version: '1.0',
    };
  }

  return JSON.stringify(output, null, 2);
}

/**
 * Export human brief as JSON.
 */
export function exportHumanBriefAsJson(
  brief: HumanBrief,
  options?: { includeMetadata?: boolean }
): string {
  const output: Record<string, unknown> = {
    ...brief,
  };

  if (options?.includeMetadata) {
    output._metadata = {
      exportedAt: new Date().toISOString(),
      format: 'json',
      briefType: 'human',
      version: '1.0',
    };
  }

  return JSON.stringify(output, null, 2);
}

// ============================================================
// MARKDOWN EXPORT
// ============================================================

/**
 * Export technical brief as Markdown.
 */
export function exportTechnicalBriefAsMarkdown(
  brief: TechnicalBrief,
  options?: { includeMetadata?: boolean }
): string {
  let markdown = renderTechnicalBriefMarkdown(brief);

  if (options?.includeMetadata) {
    const metaBlock = [
      '---',
      `exported_at: ${new Date().toISOString()}`,
      `format: markdown`,
      `brief_type: technical`,
      `brief_id: ${brief.id}`,
      `project_id: ${brief.projectId}`,
      '---',
      '',
    ].join('\n');

    markdown = metaBlock + markdown;
  }

  return markdown;
}

/**
 * Export human brief as Markdown.
 */
export function exportHumanBriefAsMarkdown(
  brief: HumanBrief,
  options?: { includeMetadata?: boolean }
): string {
  let markdown = renderHumanBriefMarkdown(brief);

  if (options?.includeMetadata) {
    const metaBlock = [
      '---',
      `exported_at: ${new Date().toISOString()}`,
      `format: markdown`,
      `brief_type: human`,
      `brief_id: ${brief.id}`,
      `project_id: ${brief.projectId}`,
      `project_name: ${brief.projectName}`,
      '---',
      '',
    ].join('\n');

    markdown = metaBlock + markdown;
  }

  return markdown;
}

// ============================================================
// PDF EXPORT (Placeholder - requires external library)
// ============================================================

/**
 * Export technical brief as PDF.
 *
 * NOTE: Full PDF generation requires a library like puppeteer or pdfkit.
 * This implementation provides the structure for integration.
 */
export async function exportTechnicalBriefAsPdf(
  brief: TechnicalBrief,
  _options?: { includeMetadata?: boolean }
): Promise<string> {
  // For now, we return markdown that can be converted to PDF externally
  // In production, use puppeteer or a PDF service

  logger.warn('PDF export using markdown fallback - install puppeteer for native PDF');

  const markdown = renderTechnicalBriefMarkdown(brief);

  // Return base64 encoded markdown as placeholder
  // Real implementation would generate actual PDF bytes
  return Buffer.from(markdown).toString('base64');
}

/**
 * Export human brief as PDF.
 */
export async function exportHumanBriefAsPdf(
  brief: HumanBrief,
  _options?: { includeMetadata?: boolean }
): Promise<string> {
  logger.warn('PDF export using markdown fallback - install puppeteer for native PDF');

  const markdown = renderHumanBriefMarkdown(brief);

  return Buffer.from(markdown).toString('base64');
}

// ============================================================
// UNIFIED EXPORT FUNCTIONS
// ============================================================

/**
 * Export a technical brief to the specified format.
 */
export async function exportTechnicalBrief(
  brief: TechnicalBrief,
  options: ExportOptions
): Promise<ExportResult> {
  const startTime = Date.now();

  logger.info('Exporting technical brief', {
    briefId: brief.id,
    format: options.format,
  });

  try {
    let content: string;
    let contentType: string;

    switch (options.format) {
      case 'json':
        content = exportTechnicalBriefAsJson(brief, {
          includeMetadata: options.includeMetadata,
        });
        contentType = 'application/json';
        break;

      case 'markdown':
        content = exportTechnicalBriefAsMarkdown(brief, {
          includeMetadata: options.includeMetadata,
        });
        contentType = 'text/markdown';
        break;

      case 'pdf':
        content = await exportTechnicalBriefAsPdf(brief, {
          includeMetadata: options.includeMetadata,
        });
        contentType = 'application/pdf';
        break;

      default:
        throw new Error(`Unsupported export format: ${options.format}`);
    }

    const filename = options.filename || generateFilename(brief.id, 'technical', options.format);

    let archiveId: string | undefined;
    if (options.archive) {
      archiveId = await archiveBrief(
        brief.projectId,
        'technical',
        options.format,
        content,
        { briefId: brief.id, generatedAt: brief.generatedAt }
      );
    }

    const result: ExportResult = {
      success: true,
      format: options.format,
      content,
      contentType,
      filename,
      size: Buffer.byteLength(content),
      archiveId,
      exportedAt: new Date().toISOString(),
    };

    logger.info('Technical brief exported', {
      briefId: brief.id,
      format: options.format,
      size: result.size,
      durationMs: Date.now() - startTime,
    });

    return result;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('Technical brief export failed', { error: errorMsg });

    return {
      success: false,
      format: options.format,
      content: '',
      contentType: '',
      filename: '',
      size: 0,
      error: errorMsg,
      exportedAt: new Date().toISOString(),
    };
  }
}

/**
 * Export a human brief to the specified format.
 */
export async function exportHumanBrief(
  brief: HumanBrief,
  options: ExportOptions
): Promise<ExportResult> {
  const startTime = Date.now();

  logger.info('Exporting human brief', {
    briefId: brief.id,
    format: options.format,
  });

  try {
    let content: string;
    let contentType: string;

    switch (options.format) {
      case 'json':
        content = exportHumanBriefAsJson(brief, {
          includeMetadata: options.includeMetadata,
        });
        contentType = 'application/json';
        break;

      case 'markdown':
        content = exportHumanBriefAsMarkdown(brief, {
          includeMetadata: options.includeMetadata,
        });
        contentType = 'text/markdown';
        break;

      case 'pdf':
        content = await exportHumanBriefAsPdf(brief, {
          includeMetadata: options.includeMetadata,
        });
        contentType = 'application/pdf';
        break;

      default:
        throw new Error(`Unsupported export format: ${options.format}`);
    }

    const filename = options.filename || generateFilename(brief.id, 'human', options.format);

    let archiveId: string | undefined;
    if (options.archive) {
      archiveId = await archiveBrief(
        brief.projectId,
        'human',
        options.format,
        content,
        { briefId: brief.id, projectName: brief.projectName, generatedAt: brief.generatedAt }
      );
    }

    const result: ExportResult = {
      success: true,
      format: options.format,
      content,
      contentType,
      filename,
      size: Buffer.byteLength(content),
      archiveId,
      exportedAt: new Date().toISOString(),
    };

    logger.info('Human brief exported', {
      briefId: brief.id,
      format: options.format,
      size: result.size,
      durationMs: Date.now() - startTime,
    });

    return result;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('Human brief export failed', { error: errorMsg });

    return {
      success: false,
      format: options.format,
      content: '',
      contentType: '',
      filename: '',
      size: 0,
      error: errorMsg,
      exportedAt: new Date().toISOString(),
    };
  }
}

// ============================================================
// ARCHIVE FUNCTIONS
// ============================================================

/**
 * Archive a brief export to the database.
 */
async function archiveBrief(
  projectId: string,
  briefType: BriefType,
  format: ExportFormat,
  content: string,
  metadata: Record<string, unknown>
): Promise<string> {
  const { data, error } = await supabase
    .from('brief_archive')
    .insert({
      project_id: projectId,
      brief_type: briefType,
      format,
      content,
      metadata,
    })
    .select('id')
    .single();

  if (error) {
    logger.error('Failed to archive brief', { error: error.message });
    throw new Error(`Archive failed: ${error.message}`);
  }

  logger.info('Brief archived', { archiveId: data.id, briefType, format });

  return data.id;
}

/**
 * Retrieve an archived brief.
 */
export async function getArchivedBrief(archiveId: string): Promise<ArchivedBrief | null> {
  const { data, error } = await supabase
    .from('brief_archive')
    .select('*')
    .eq('id', archiveId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null;
    }
    throw new Error(`Failed to retrieve archive: ${error.message}`);
  }

  return {
    id: data.id,
    projectId: data.project_id,
    briefType: data.brief_type,
    format: data.format,
    content: data.content,
    metadata: data.metadata,
    createdAt: data.created_at,
  };
}

/**
 * List archived briefs for a project.
 */
export async function listArchivedBriefs(
  projectId: string,
  options?: { briefType?: BriefType; format?: ExportFormat; limit?: number }
): Promise<ArchivedBrief[]> {
  let query = supabase
    .from('brief_archive')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false });

  if (options?.briefType) {
    query = query.eq('brief_type', options.briefType);
  }

  if (options?.format) {
    query = query.eq('format', options.format);
  }

  if (options?.limit) {
    query = query.limit(options.limit);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to list archives: ${error.message}`);
  }

  return data.map(row => ({
    id: row.id,
    projectId: row.project_id,
    briefType: row.brief_type,
    format: row.format,
    content: row.content,
    metadata: row.metadata,
    createdAt: row.created_at,
  }));
}

/**
 * Delete an archived brief.
 */
export async function deleteArchivedBrief(archiveId: string): Promise<boolean> {
  const { error } = await supabase
    .from('brief_archive')
    .delete()
    .eq('id', archiveId);

  if (error) {
    logger.error('Failed to delete archive', { archiveId, error: error.message });
    return false;
  }

  logger.info('Archive deleted', { archiveId });
  return true;
}

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

/**
 * Generate a filename for the export.
 */
function generateFilename(
  briefId: string,
  briefType: BriefType,
  format: ExportFormat
): string {
  const timestamp = new Date().toISOString().split('T')[0];
  const extension = format === 'markdown' ? 'md' : format;

  return `techscout-${briefType}-brief-${timestamp}-${briefId.slice(-8)}.${extension}`;
}

/**
 * Batch export multiple briefs.
 */
export async function batchExport(
  briefs: Array<{ brief: TechnicalBrief | HumanBrief; type: BriefType }>,
  options: ExportOptions
): Promise<ExportResult[]> {
  const results: ExportResult[] = [];

  for (const { brief, type } of briefs) {
    let result: ExportResult;

    if (type === 'technical') {
      result = await exportTechnicalBrief(brief as TechnicalBrief, options);
    } else {
      result = await exportHumanBrief(brief as HumanBrief, options);
    }

    results.push(result);
  }

  return results;
}

/**
 * Create a combined export with both technical and human briefs.
 */
export function createCombinedMarkdownExport(
  technicalBrief: TechnicalBrief,
  humanBrief: HumanBrief
): string {
  const lines: string[] = [];

  lines.push('# TechScout Combined Report');
  lines.push('');
  lines.push(`**Generated:** ${new Date().toISOString()}`);
  lines.push(`**Project:** ${humanBrief.projectName}`);
  lines.push('');
  lines.push('---');
  lines.push('');

  // Executive summary from human brief
  lines.push('# Part 1: Executive Summary');
  lines.push('');
  lines.push(renderHumanBriefMarkdown(humanBrief));
  lines.push('');
  lines.push('---');
  lines.push('');

  // Technical details
  lines.push('# Part 2: Technical Details');
  lines.push('');
  lines.push(renderTechnicalBriefMarkdown(technicalBrief));

  return lines.join('\n');
}
