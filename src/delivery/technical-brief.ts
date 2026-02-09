/**
 * TechScout — Technical Brief Formatter (Layer 4)
 *
 * Formats recommendations for developers.
 * Includes IFX-tagged analysis, effort estimates, impact assessment,
 * tradeoffs, and failure modes.
 */

import type {
  Recommendation,
  TechnicalOutput,
  StabilityAssessment,
  RecommendationSubject,
  IFXFact,
  IFXInference,
  IFXAssumption,
  CalibratedEffort,
  TechnicalImpact,
  FailureMode,
} from '../types';

// ============================================================
// TYPES
// ============================================================

export interface TechnicalBrief {
  id: string;
  projectId: string;
  generatedAt: string;
  recommendations: TechnicalRecommendationBrief[];
  summary: TechnicalBriefSummary;
}

export interface TechnicalRecommendationBrief {
  id: string;
  subject: SubjectSection;
  classification: ClassificationSection;
  stability: StabilitySection;
  analysis: AnalysisSection;
  effort: EffortSection;
  impact: ImpactSection;
  tradeoffs: TradeoffsSection;
  risks: RisksSection;
  limitations: string[];
  links: LinkSection;
}

export interface SubjectSection {
  name: string;
  type: string;
  version?: string;
  ecosystem?: string;
  license?: string;
  maturity: string;
  traction: {
    stars?: string;
    downloads?: string;
    growth?: string;
  };
}

export interface ClassificationSection {
  action: string;
  priority: string;
  confidence: string;
  replaces?: string;
  complements?: string;
  enables?: string;
}

export interface StabilitySection {
  verdict: string;
  reasoning: string;
  costOfChange: {
    effort: string;
    regressionRisk: string;
    learningCurve: string;
    reversibility: string;
  };
  costOfNoChange: {
    securityExposure: string;
    maintenanceRisk: string;
    deprecationRisk: string;
  };
}

export interface AnalysisSection {
  facts: string[];
  inferences: string[];
  assumptions: string[];
}

export interface EffortSection {
  estimate: string;
  calibrated: boolean;
  calibrationNote?: string;
  complexity: string;
  breakingChanges: boolean;
  reversibility: string;
  steps: string[];
}

export interface ImpactSection {
  security: { change: string; detail: string };
  performance: { change: string; detail: string };
  maintainability: { change: string; detail: string };
  cost: { change: string; detail: string };
  risk: { level: string; detail: string };
}

export interface TradeoffsSection {
  gains: string[];
  losses: string[];
}

export interface RisksSection {
  failureModes: Array<{
    mode: string;
    probability: string;
    mitigation: string;
  }>;
}

export interface LinkSection {
  subject?: string;
  feedItem?: string;
  traceId: string;
}

export interface TechnicalBriefSummary {
  totalRecommendations: number;
  byPriority: Record<string, number>;
  byAction: Record<string, number>;
  topConcerns: string[];
}

// ============================================================
// FORMATTERS
// ============================================================

function formatSubject(subject: RecommendationSubject): SubjectSection {
  return {
    name: subject.name,
    type: subject.type,
    version: subject.version,
    ecosystem: subject.ecosystem,
    license: subject.license,
    maturity: subject.maturity,
    traction: {
      stars: subject.traction.githubStars?.toLocaleString(),
      downloads: subject.traction.npmWeeklyDownloads?.toLocaleString(),
      growth: subject.traction.githubStars30dGrowth,
    },
  };
}

function formatClassification(rec: Recommendation): ClassificationSection {
  return {
    action: rec.action,
    priority: rec.priority.toUpperCase(),
    confidence: `${(rec.confidence * 100).toFixed(0)}%`,
    replaces: rec.replaces,
    complements: rec.complements,
    enables: rec.enables,
  };
}

function formatStability(stability: StabilityAssessment): StabilitySection {
  return {
    verdict: stability.verdict,
    reasoning: stability.verdictReasoning,
    costOfChange: {
      effort: stability.costOfChange.effortDays,
      regressionRisk: stability.costOfChange.regressionRisk,
      learningCurve: stability.costOfChange.learningCurve,
      reversibility: stability.costOfChange.reversibility,
    },
    costOfNoChange: {
      securityExposure: stability.costOfNoChange.securityExposure,
      maintenanceRisk: stability.costOfNoChange.maintenanceRisk,
      deprecationRisk: stability.costOfNoChange.deprecationRisk,
    },
  };
}

function formatAnalysis(technical: TechnicalOutput): AnalysisSection {
  const analysis = technical?.analysis || { facts: [], inferences: [], assumptions: [] };
  return {
    facts: (analysis.facts || []).map(f =>
      `[FACT] ${f.claim} (source: ${f.source}, reliability: ${f.sourceReliability})`
    ),
    inferences: (analysis.inferences || []).map(i =>
      `[INFERENCE] ${i.claim} (confidence: ${(i.confidence * 100).toFixed(0)}%, derived from: ${(i.derivedFrom || []).join(', ')})`
    ),
    assumptions: (analysis.assumptions || []).map(a =>
      `[ASSUMPTION] ${a.claim}`
    ),
  };
}

function formatEffort(effort: CalibratedEffort): EffortSection {
  return {
    estimate: effort.calibrationApplied
      ? `${effort.calibratedEstimateDays} days (calibrated from ${effort.rawEstimateDays})`
      : `${effort.rawEstimateDays} days`,
    calibrated: effort.calibrationApplied,
    calibrationNote: effort.calibrationNote,
    complexity: effort.complexity,
    breakingChanges: effort.breakingChanges,
    reversibility: effort.reversibility,
    steps: effort.steps,
  };
}

function formatImpact(impact: TechnicalImpact): ImpactSection {
  return {
    security: { change: impact.security.scoreChange, detail: impact.security.detail },
    performance: { change: impact.performance.scoreChange, detail: impact.performance.detail },
    maintainability: { change: impact.maintainability.scoreChange, detail: impact.maintainability.detail },
    cost: { change: impact.cost.scoreChange, detail: impact.cost.detail },
    risk: { level: impact.risk.level, detail: impact.risk.detail },
  };
}

function formatRisks(failureModes: FailureMode[]): RisksSection {
  return {
    failureModes: failureModes.map(f => ({
      mode: f.mode,
      probability: f.probability,
      mitigation: f.mitigation,
    })),
  };
}

// ============================================================
// BRIEF GENERATION
// ============================================================

/**
 * Format a single recommendation for technical audience.
 */
export function formatTechnicalRecommendation(
  rec: Recommendation
): TechnicalRecommendationBrief {
  return {
    id: rec.id,
    subject: formatSubject(rec.subject),
    classification: formatClassification(rec),
    stability: formatStability(rec.stabilityAssessment),
    analysis: formatAnalysis(rec.technical),
    effort: formatEffort(rec.technical.effort),
    impact: formatImpact(rec.technical.impact),
    tradeoffs: {
      gains: rec.technical.tradeoffs.gains,
      losses: rec.technical.tradeoffs.losses,
    },
    risks: formatRisks(rec.technical.failureModes),
    limitations: rec.technical.limitations,
    links: {
      subject: rec.subject.url,
      feedItem: rec.feedItemId,
      traceId: rec.ifxTraceId,
    },
  };
}

/**
 * Generate a complete technical brief from recommendations.
 */
export function generateTechnicalBrief(
  projectId: string,
  recommendations: Recommendation[]
): TechnicalBrief {
  const briefRecs = recommendations.map(formatTechnicalRecommendation);

  // Generate summary
  const byPriority: Record<string, number> = {};
  const byAction: Record<string, number> = {};

  for (const rec of recommendations) {
    byPriority[rec.priority] = (byPriority[rec.priority] || 0) + 1;
    byAction[rec.action] = (byAction[rec.action] || 0) + 1;
  }

  // Identify top concerns
  const topConcerns: string[] = [];
  const criticalRecs = recommendations.filter(r => r.priority === 'critical');
  const securityRecs = recommendations.filter(r =>
    r.stabilityAssessment.costOfNoChange.securityExposure !== 'none'
  );

  if (criticalRecs.length > 0) {
    topConcerns.push(`${criticalRecs.length} critical-priority recommendation(s)`);
  }
  if (securityRecs.length > 0) {
    topConcerns.push(`${securityRecs.length} security-related recommendation(s)`);
  }

  return {
    id: `brief-tech-${Date.now()}`,
    projectId,
    generatedAt: new Date().toISOString(),
    recommendations: briefRecs,
    summary: {
      totalRecommendations: recommendations.length,
      byPriority,
      byAction,
      topConcerns,
    },
  };
}

// ============================================================
// MARKDOWN RENDERING
// ============================================================

/**
 * Render technical brief as Markdown.
 */
export function renderTechnicalBriefMarkdown(brief: TechnicalBrief): string {
  const lines: string[] = [];

  lines.push(`# TechScout Technical Brief`);
  lines.push('');
  lines.push(`**Project ID:** ${brief.projectId}`);
  lines.push(`**Generated:** ${new Date(brief.generatedAt).toLocaleString()}`);
  lines.push(`**Recommendations:** ${brief.summary.totalRecommendations}`);
  lines.push('');

  if (brief.summary.topConcerns.length > 0) {
    lines.push(`## ⚠️ Top Concerns`);
    lines.push('');
    for (const concern of brief.summary.topConcerns) {
      lines.push(`- ${concern}`);
    }
    lines.push('');
  }

  lines.push(`## Summary`);
  lines.push('');
  lines.push(`| Priority | Count |`);
  lines.push(`|----------|-------|`);
  for (const [priority, count] of Object.entries(brief.summary.byPriority)) {
    lines.push(`| ${priority} | ${count} |`);
  }
  lines.push('');

  for (const rec of brief.recommendations) {
    lines.push(`---`);
    lines.push('');
    lines.push(`## ${rec.subject.name}`);
    lines.push('');
    lines.push(`**${rec.classification.action}** | Priority: **${rec.classification.priority}** | Confidence: ${rec.classification.confidence}`);
    lines.push('');

    if (rec.classification.replaces) {
      lines.push(`> Replaces: ${rec.classification.replaces}`);
      lines.push('');
    }

    lines.push(`### Subject`);
    lines.push('');
    lines.push(`- **Type:** ${rec.subject.type}`);
    lines.push(`- **Maturity:** ${rec.subject.maturity}`);
    if (rec.subject.version) lines.push(`- **Version:** ${rec.subject.version}`);
    if (rec.subject.ecosystem) lines.push(`- **Ecosystem:** ${rec.subject.ecosystem}`);
    if (rec.subject.license) lines.push(`- **License:** ${rec.subject.license}`);
    if (rec.subject.traction.stars) lines.push(`- **GitHub Stars:** ${rec.subject.traction.stars}`);
    if (rec.subject.traction.downloads) lines.push(`- **Weekly Downloads:** ${rec.subject.traction.downloads}`);
    lines.push('');

    lines.push(`### Stability Assessment`);
    lines.push('');
    lines.push(`**Verdict:** ${rec.stability.verdict}`);
    lines.push('');
    lines.push(`#### Cost of Change`);
    lines.push(`- Effort: ${rec.stability.costOfChange.effort}`);
    lines.push(`- Regression Risk: ${rec.stability.costOfChange.regressionRisk}`);
    lines.push(`- Learning Curve: ${rec.stability.costOfChange.learningCurve}`);
    lines.push(`- Reversibility: ${rec.stability.costOfChange.reversibility}`);
    lines.push('');
    lines.push(`#### Cost of No Change`);
    lines.push(`- Security Exposure: ${rec.stability.costOfNoChange.securityExposure}`);
    lines.push(`- Maintenance Risk: ${rec.stability.costOfNoChange.maintenanceRisk}`);
    lines.push(`- Deprecation Risk: ${rec.stability.costOfNoChange.deprecationRisk}`);
    lines.push('');

    lines.push(`### Analysis`);
    lines.push('');
    if (rec.analysis.facts.length > 0) {
      lines.push(`#### Facts`);
      for (const fact of rec.analysis.facts) {
        lines.push(`- ${fact}`);
      }
      lines.push('');
    }
    if (rec.analysis.inferences.length > 0) {
      lines.push(`#### Inferences`);
      for (const inf of rec.analysis.inferences) {
        lines.push(`- ${inf}`);
      }
      lines.push('');
    }
    if (rec.analysis.assumptions.length > 0) {
      lines.push(`#### Assumptions`);
      for (const ass of rec.analysis.assumptions) {
        lines.push(`- ${ass}`);
      }
      lines.push('');
    }

    lines.push(`### Implementation`);
    lines.push('');
    lines.push(`**Effort:** ${rec.effort.estimate}`);
    lines.push(`**Complexity:** ${rec.effort.complexity}`);
    lines.push(`**Breaking Changes:** ${rec.effort.breakingChanges ? 'Yes' : 'No'}`);
    lines.push('');
    lines.push(`#### Steps`);
    for (let i = 0; i < rec.effort.steps.length; i++) {
      lines.push(`${i + 1}. ${rec.effort.steps[i]}`);
    }
    lines.push('');

    lines.push(`### Impact`);
    lines.push('');
    lines.push(`| Area | Change | Detail |`);
    lines.push(`|------|--------|--------|`);
    lines.push(`| Security | ${rec.impact.security.change} | ${rec.impact.security.detail} |`);
    lines.push(`| Performance | ${rec.impact.performance.change} | ${rec.impact.performance.detail} |`);
    lines.push(`| Maintainability | ${rec.impact.maintainability.change} | ${rec.impact.maintainability.detail} |`);
    lines.push(`| Cost | ${rec.impact.cost.change} | ${rec.impact.cost.detail} |`);
    lines.push('');

    lines.push(`### Tradeoffs`);
    lines.push('');
    lines.push(`**Gains:**`);
    for (const gain of rec.tradeoffs.gains) {
      lines.push(`- ✅ ${gain}`);
    }
    lines.push('');
    lines.push(`**Losses:**`);
    for (const loss of rec.tradeoffs.losses) {
      lines.push(`- ⚠️ ${loss}`);
    }
    lines.push('');

    if (rec.risks.failureModes.length > 0) {
      lines.push(`### Risk Analysis`);
      lines.push('');
      lines.push(`| Failure Mode | Probability | Mitigation |`);
      lines.push(`|--------------|-------------|------------|`);
      for (const fm of rec.risks.failureModes) {
        lines.push(`| ${fm.mode} | ${fm.probability} | ${fm.mitigation} |`);
      }
      lines.push('');
    }

    if (rec.limitations.length > 0) {
      lines.push(`### Limitations`);
      lines.push('');
      for (const lim of rec.limitations) {
        lines.push(`- ${lim}`);
      }
      lines.push('');
    }

    lines.push(`**Trace ID:** \`${rec.links.traceId}\``);
    if (rec.links.subject) {
      lines.push(`**Link:** [${rec.subject.name}](${rec.links.subject})`);
    }
    lines.push('');
  }

  lines.push(`---`);
  lines.push(`*Generated by TechScout*`);

  return lines.join('\n');
}

/**
 * Render a compact technical summary for notifications.
 */
export function renderTechnicalSummary(brief: TechnicalBrief): string {
  const lines: string[] = [];

  lines.push(`📊 TechScout Technical Brief`);
  lines.push(`${brief.summary.totalRecommendations} recommendation(s)`);
  lines.push('');

  for (const rec of brief.recommendations.slice(0, 5)) {
    const icon = rec.classification.priority === 'critical' ? '🔴'
      : rec.classification.priority === 'high' ? '🟠'
      : rec.classification.priority === 'medium' ? '🟡'
      : '🟢';

    lines.push(`${icon} **${rec.subject.name}** (${rec.classification.action})`);
    lines.push(`   ${rec.effort.estimate} | ${rec.stability.verdict}`);
  }

  if (brief.recommendations.length > 5) {
    lines.push(`... and ${brief.recommendations.length - 5} more`);
  }

  return lines.join('\n');
}
