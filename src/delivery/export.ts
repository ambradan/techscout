/**
 * TechScout — Export Module (Layer 4)
 *
 * Exports briefs to various formats: JSON, Markdown, PDF.
 * Archives exports to database for retrieval.
 * Stores PDFs in Supabase Storage bucket "brief-archive".
 */

import PDFDocument from 'pdfkit';
import { logger } from '../lib/logger';
import { supabase, getAdminClient } from '../db/client';
import type { TechnicalBrief, TechnicalRecommendation } from './technical-brief';
import type { HumanBrief, HumanRecommendationBrief } from './human-brief';
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
// PDF EXPORT (using pdfkit)
// ============================================================

const PDF_COLORS = {
  primary: '#1a1a2e',
  secondary: '#16213e',
  accent: '#0f3460',
  critical: '#dc2626',
  high: '#ea580c',
  medium: '#ca8a04',
  low: '#2563eb',
  info: '#6b7280',
  text: '#1f2937',
  muted: '#6b7280',
  border: '#e5e7eb',
};

/**
 * Generate PDF buffer for technical brief.
 */
export async function exportTechnicalBriefPDF(
  brief: TechnicalBrief
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const chunks: Buffer[] = [];
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 50, bottom: 50, left: 50, right: 50 },
        info: {
          Title: `TechScout Technical Brief - ${brief.projectId}`,
          Author: 'TechScout',
          Subject: 'Technology Recommendations',
          CreationDate: new Date(),
        },
      });

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Header
      renderPdfHeader(doc, 'TechScout Technical Brief', brief.projectId, brief.generatedAt);

      // Summary section
      doc.fontSize(14).fillColor(PDF_COLORS.primary).text('Summary', { underline: true });
      doc.moveDown(0.5);
      doc.fontSize(10).fillColor(PDF_COLORS.text);
      doc.text(`Total Recommendations: ${brief.summary.totalRecommendations}`);
      doc.text(`Critical: ${brief.summary.byPriority.critical} | High: ${brief.summary.byPriority.high} | Medium: ${brief.summary.byPriority.medium} | Low: ${brief.summary.byPriority.low}`);

      if (brief.summary.topConcerns.length > 0) {
        doc.moveDown(0.5);
        doc.text('Top Concerns:', { underline: true });
        for (const concern of brief.summary.topConcerns) {
          doc.text(`  • ${concern}`);
        }
      }
      doc.moveDown(1);

      // Recommendations
      doc.fontSize(14).fillColor(PDF_COLORS.primary).text('Recommendations', { underline: true });
      doc.moveDown(0.5);

      for (let i = 0; i < brief.recommendations.length; i++) {
        const rec = brief.recommendations[i];

        if (doc.y > 700) {
          doc.addPage();
          renderPdfHeader(doc, 'TechScout Technical Brief', brief.projectId, brief.generatedAt);
        }

        renderTechnicalRecommendationPdf(doc, rec, i + 1);
      }

      // Footer
      renderPdfFooter(doc, brief.id);

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Generate PDF buffer for human brief (Italian).
 */
export async function exportHumanBriefPDF(
  brief: HumanBrief
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const chunks: Buffer[] = [];
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 50, bottom: 50, left: 50, right: 50 },
        info: {
          Title: `Report Tecnologico - ${brief.projectName}`,
          Author: 'TechScout',
          Subject: 'Opportunita Tecnologiche',
          CreationDate: new Date(),
        },
      });

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Header
      renderPdfHeader(doc, `Report Tecnologico: ${brief.projectName}`, brief.projectId, brief.generatedAt);

      // Executive Summary
      doc.fontSize(14).fillColor(PDF_COLORS.primary).text('Riepilogo Esecutivo', { underline: true });
      doc.moveDown(0.5);
      doc.fontSize(10).fillColor(PDF_COLORS.text);
      doc.text(`Totale Raccomandazioni: ${brief.executiveSummary.totalRecommendations}`);
      doc.text(`Da affrontare subito: ${brief.executiveSummary.immediate}`);
      doc.text(`Da pianificare: ${brief.executiveSummary.planned}`);
      doc.text(`Da monitorare: ${brief.executiveSummary.monitoring}`);
      doc.text(`Livello di rischio: ${brief.executiveSummary.overallRiskLevel}`);

      if (brief.executiveSummary.keyHighlights.length > 0) {
        doc.moveDown(0.5);
        doc.text('Punti chiave:', { underline: true });
        for (const highlight of brief.executiveSummary.keyHighlights) {
          doc.text(`  • ${highlight}`);
        }
      }
      doc.moveDown(1);

      // Recommendations
      doc.fontSize(14).fillColor(PDF_COLORS.primary).text('Raccomandazioni', { underline: true });
      doc.moveDown(0.5);

      for (let i = 0; i < brief.recommendations.length; i++) {
        const rec = brief.recommendations[i];

        if (doc.y > 700) {
          doc.addPage();
          renderPdfHeader(doc, `Report Tecnologico: ${brief.projectName}`, brief.projectId, brief.generatedAt);
        }

        renderHumanRecommendationPdf(doc, rec, i + 1);
      }

      // Footer
      renderPdfFooter(doc, brief.id);

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Render PDF header.
 */
function renderPdfHeader(
  doc: PDFKit.PDFDocument,
  title: string,
  projectId: string,
  generatedAt: string
): void {
  const date = new Date(generatedAt).toLocaleDateString('it-IT', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  doc.fontSize(18).fillColor(PDF_COLORS.primary).text(title, { align: 'center' });
  doc.moveDown(0.3);
  doc.fontSize(10).fillColor(PDF_COLORS.muted).text(`Progetto: ${projectId} | Data: ${date}`, { align: 'center' });
  doc.moveDown(0.5);

  // Horizontal line
  doc.strokeColor(PDF_COLORS.border).lineWidth(1)
    .moveTo(50, doc.y)
    .lineTo(545, doc.y)
    .stroke();
  doc.moveDown(1);
}

/**
 * Render PDF footer.
 */
function renderPdfFooter(doc: PDFKit.PDFDocument, traceId: string): void {
  const pageCount = doc.bufferedPageRange().count;

  for (let i = 0; i < pageCount; i++) {
    doc.switchToPage(i);

    // Footer line
    doc.strokeColor(PDF_COLORS.border).lineWidth(1)
      .moveTo(50, 780)
      .lineTo(545, 780)
      .stroke();

    doc.fontSize(8).fillColor(PDF_COLORS.muted);
    doc.text(`Trace ID: ${traceId}`, 50, 790);
    doc.text(`Page ${i + 1} of ${pageCount}`, 0, 790, { align: 'right', width: 545 });
  }
}

/**
 * Render a technical recommendation in PDF.
 */
function renderTechnicalRecommendationPdf(
  doc: PDFKit.PDFDocument,
  rec: TechnicalRecommendation,
  index: number
): void {
  const priorityColor = getPriorityColor(rec.classification.priority);

  // Title with priority badge
  doc.fontSize(12).fillColor(priorityColor)
    .text(`${index}. ${rec.subject.name}`, { continued: true });
  doc.fillColor(PDF_COLORS.muted)
    .text(` [${rec.classification.priority.toUpperCase()}]`);

  doc.moveDown(0.3);
  doc.fontSize(9).fillColor(PDF_COLORS.text);

  // Classification
  doc.text(`Action: ${rec.classification.action} | Confidence: ${rec.classification.confidence}`);
  if (rec.classification.replaces) {
    doc.text(`Replaces: ${rec.classification.replaces}`);
  }

  // Stability verdict
  doc.text(`Verdict: ${rec.stability.verdict} - ${rec.stability.reasoning}`);

  // Effort
  doc.text(`Effort: ${rec.effort.estimate} (Complexity: ${rec.effort.complexity})`);
  if (rec.effort.breakingChanges) {
    doc.fillColor(PDF_COLORS.high).text('Breaking changes: Yes').fillColor(PDF_COLORS.text);
  }

  // Impact
  if (rec.impact.performance !== 'No change') {
    doc.text(`Performance: ${rec.impact.performance}`);
  }
  if (rec.impact.security !== 'No change') {
    doc.text(`Security: ${rec.impact.security}`);
  }

  doc.moveDown(1);
}

/**
 * Render a human recommendation in PDF (Italian).
 */
function renderHumanRecommendationPdf(
  doc: PDFKit.PDFDocument,
  rec: HumanRecommendationBrief,
  index: number
): void {
  const urgencyColor = getUrgencyColor(rec.urgency.level);

  // Title with urgency badge
  doc.fontSize(12).fillColor(urgencyColor)
    .text(`${index}. ${rec.title}`, { continued: true });
  doc.fillColor(PDF_COLORS.muted)
    .text(` [${rec.urgency.label}]`);

  doc.moveDown(0.3);
  doc.fontSize(9).fillColor(PDF_COLORS.text);

  // One-liner
  doc.font('Helvetica-Oblique').text(rec.oneLiner).font('Helvetica');

  // Summary
  doc.moveDown(0.3);
  doc.text(rec.summary);

  // Verdict
  doc.moveDown(0.3);
  doc.font('Helvetica-Bold').text(`Raccomandazione: ${rec.verdict.recommendation}`).font('Helvetica');
  doc.text(rec.verdict.plain);

  // Impact
  doc.moveDown(0.3);
  doc.text(`Impatto: ${rec.impact.security} | ${rec.impact.cost} | ${rec.impact.risk}`);

  // Client talking points
  if (rec.clientTalkingPoints.length > 0) {
    doc.moveDown(0.3);
    doc.text('Punti per il cliente:');
    for (const point of rec.clientTalkingPoints.slice(0, 2)) {
      doc.text(`  • ${point.point}`);
    }
  }

  doc.moveDown(1);
}

/**
 * Get color for priority level.
 */
function getPriorityColor(priority: string): string {
  const p = priority.toLowerCase();
  if (p === 'critical') return PDF_COLORS.critical;
  if (p === 'high') return PDF_COLORS.high;
  if (p === 'medium') return PDF_COLORS.medium;
  if (p === 'low') return PDF_COLORS.low;
  return PDF_COLORS.info;
}

/**
 * Get color for urgency level.
 */
function getUrgencyColor(urgency: string): string {
  if (urgency === 'immediate') return PDF_COLORS.critical;
  if (urgency === 'soon') return PDF_COLORS.high;
  if (urgency === 'planned') return PDF_COLORS.medium;
  return PDF_COLORS.info;
}

// Legacy PDF functions for backward compatibility
export async function exportTechnicalBriefAsPdf(
  brief: TechnicalBrief,
  _options?: { includeMetadata?: boolean }
): Promise<string> {
  const pdfBuffer = await exportTechnicalBriefPDF(brief);
  return pdfBuffer.toString('base64');
}

export async function exportHumanBriefAsPdf(
  brief: HumanBrief,
  _options?: { includeMetadata?: boolean }
): Promise<string> {
  const pdfBuffer = await exportHumanBriefPDF(brief);
  return pdfBuffer.toString('base64');
}

// ============================================================
// SUPABASE STORAGE INTEGRATION
// ============================================================

const STORAGE_BUCKET = 'brief-archive';

export interface PdfExportResult {
  success: boolean;
  filePath?: string;
  fileSize?: number;
  archiveId?: string;
  publicUrl?: string;
  error?: string;
  exportedAt: string;
}

/**
 * Upload PDF to Supabase Storage and archive to database.
 */
export async function uploadAndArchivePdf(
  projectId: string,
  briefType: BriefType,
  briefId: string,
  pdfBuffer: Buffer,
  metadata: Record<string, unknown>
): Promise<PdfExportResult> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `${projectId}/${briefType}-${timestamp}.pdf`;

  logger.info('Uploading PDF to storage', { projectId, briefType, filename, size: pdfBuffer.length });

  try {
    const admin = getAdminClient();

    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await admin.storage
      .from(STORAGE_BUCKET)
      .upload(filename, pdfBuffer, {
        contentType: 'application/pdf',
        upsert: false,
      });

    if (uploadError) {
      logger.error('Storage upload failed', { error: uploadError.message });
      return {
        success: false,
        error: `Storage upload failed: ${uploadError.message}`,
        exportedAt: new Date().toISOString(),
      };
    }

    // Get public URL (if bucket is public) or signed URL
    const { data: urlData } = admin.storage
      .from(STORAGE_BUCKET)
      .getPublicUrl(filename);

    // Archive to database
    const now = new Date();
    const periodStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); // 7 days ago

    const { data: archiveData, error: archiveError } = await admin
      .from('brief_archive')
      .insert({
        project_id: projectId,
        brief_type: briefType,
        format: 'pdf',
        file_path: uploadData.path,
        file_size_bytes: pdfBuffer.length,
        recommendation_count: (metadata.recommendationCount as number) || 0,
        period_start: periodStart.toISOString(),
        period_end: now.toISOString(),
        metadata: {
          ...metadata,
          briefId,
          uploadedAt: now.toISOString(),
        },
      })
      .select('id')
      .single();

    if (archiveError) {
      logger.error('Archive record failed', { error: archiveError.message });
      // PDF is uploaded but archive failed - still return success with warning
      return {
        success: true,
        filePath: uploadData.path,
        fileSize: pdfBuffer.length,
        publicUrl: urlData.publicUrl,
        error: `Archive record failed: ${archiveError.message}`,
        exportedAt: new Date().toISOString(),
      };
    }

    logger.info('PDF uploaded and archived', {
      archiveId: archiveData.id,
      filePath: uploadData.path,
      size: pdfBuffer.length,
    });

    return {
      success: true,
      filePath: uploadData.path,
      fileSize: pdfBuffer.length,
      archiveId: archiveData.id,
      publicUrl: urlData.publicUrl,
      exportedAt: new Date().toISOString(),
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('PDF export failed', { error: errorMsg });

    return {
      success: false,
      error: errorMsg,
      exportedAt: new Date().toISOString(),
    };
  }
}

/**
 * Export technical brief to PDF and upload to storage.
 */
export async function exportAndUploadTechnicalBriefPDF(
  brief: TechnicalBrief
): Promise<PdfExportResult> {
  try {
    const pdfBuffer = await exportTechnicalBriefPDF(brief);

    return uploadAndArchivePdf(
      brief.projectId,
      'technical',
      brief.id,
      pdfBuffer,
      {
        generatedAt: brief.generatedAt,
        recommendationCount: brief.summary.totalRecommendations,
        byPriority: brief.summary.byPriority,
      }
    );
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: errorMsg,
      exportedAt: new Date().toISOString(),
    };
  }
}

/**
 * Export human brief to PDF and upload to storage.
 */
export async function exportAndUploadHumanBriefPDF(
  brief: HumanBrief
): Promise<PdfExportResult> {
  try {
    const pdfBuffer = await exportHumanBriefPDF(brief);

    return uploadAndArchivePdf(
      brief.projectId,
      'human',
      brief.id,
      pdfBuffer,
      {
        projectName: brief.projectName,
        generatedAt: brief.generatedAt,
        recommendationCount: brief.executiveSummary.totalRecommendations,
        executiveSummary: brief.executiveSummary,
      }
    );
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: errorMsg,
      exportedAt: new Date().toISOString(),
    };
  }
}

/**
 * Download PDF from storage.
 */
export async function downloadPdfFromStorage(filePath: string): Promise<Buffer | null> {
  const admin = getAdminClient();

  const { data, error } = await admin.storage
    .from(STORAGE_BUCKET)
    .download(filePath);

  if (error) {
    logger.error('PDF download failed', { filePath, error: error.message });
    return null;
  }

  return Buffer.from(await data.arrayBuffer());
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
