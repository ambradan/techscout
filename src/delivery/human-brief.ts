/**
 * TechScout — Human-Friendly Brief Formatter (Layer 4)
 *
 * Formats recommendations for PM and stakeholders.
 * No technical jargon. Plain language summaries.
 * Includes client talking points and business impact.
 */

import type {
  Recommendation,
  HumanFriendlyOutput,
  StabilityAssessment,
  ClientTalkingPoint,
} from '../types';

// ============================================================
// TYPES
// ============================================================

export interface HumanBrief {
  id: string;
  projectId: string;
  projectName: string;
  generatedAt: string;
  recommendations: HumanRecommendationBrief[];
  executiveSummary: ExecutiveSummary;
}

export interface HumanRecommendationBrief {
  id: string;
  title: string;
  oneLiner: string;
  summary: string;
  whyNow: string;
  verdict: VerdictSection;
  impact: ImpactSummarySection;
  clientTalkingPoints: ClientTalkingPoint[];
  urgency: UrgencyIndicator;
}

export interface VerdictSection {
  recommendation: string;
  plain: string;
}

export interface ImpactSummarySection {
  security: string;
  cost: string;
  risk: string;
  urgency: string;
}

export interface UrgencyIndicator {
  level: 'immediate' | 'soon' | 'planned' | 'monitor';
  label: string;
  color: string;
}

export interface ExecutiveSummary {
  totalRecommendations: number;
  immediate: number;
  planned: number;
  monitoring: number;
  keyHighlights: string[];
  overallRiskLevel: string;
}

// ============================================================
// URGENCY MAPPING
// ============================================================

function getUrgencyIndicator(
  priority: string,
  verdict: string
): UrgencyIndicator {
  if (priority === 'critical') {
    return { level: 'immediate', label: 'Azione immediata', color: 'red' };
  }
  if (priority === 'high' && verdict === 'RECOMMEND') {
    return { level: 'soon', label: 'Azione consigliata', color: 'orange' };
  }
  if (verdict === 'RECOMMEND') {
    return { level: 'planned', label: 'Da pianificare', color: 'yellow' };
  }
  return { level: 'monitor', label: 'Da monitorare', color: 'blue' };
}

// ============================================================
// FORMATTERS
// ============================================================

function formatVerdict(stability: StabilityAssessment): VerdictSection {
  const verdictMap: Record<string, string> = {
    RECOMMEND: 'Consigliato',
    MONITOR: 'Da monitorare',
    DEFER: 'Da rimandare',
  };

  return {
    recommendation: verdictMap[stability.verdict] || stability.verdict,
    plain: stability.verdictPlain,
  };
}

function formatImpactSummary(hf: HumanFriendlyOutput): ImpactSummarySection {
  return {
    security: hf.impactSummary.security,
    cost: hf.impactSummary.costo,
    risk: hf.impactSummary.rischio,
    urgency: hf.impactSummary.urgenza,
  };
}

// ============================================================
// BRIEF GENERATION
// ============================================================

/**
 * Format a single recommendation for human audience.
 */
export function formatHumanRecommendation(
  rec: Recommendation
): HumanRecommendationBrief {
  return {
    id: rec.id,
    title: rec.humanFriendly.title,
    oneLiner: rec.humanFriendly.oneLiner,
    summary: rec.humanFriendly.summary,
    whyNow: rec.humanFriendly.whyNow,
    verdict: formatVerdict(rec.stabilityAssessment),
    impact: formatImpactSummary(rec.humanFriendly),
    clientTalkingPoints: rec.humanFriendly.clientTalkingPoints,
    urgency: getUrgencyIndicator(rec.priority, rec.stabilityAssessment.verdict),
  };
}

/**
 * Generate a complete human-friendly brief from recommendations.
 */
export function generateHumanBrief(
  projectId: string,
  projectName: string,
  recommendations: Recommendation[]
): HumanBrief {
  const briefRecs = recommendations.map(formatHumanRecommendation);

  // Count by urgency
  let immediate = 0;
  let planned = 0;
  let monitoring = 0;

  for (const rec of briefRecs) {
    if (rec.urgency.level === 'immediate' || rec.urgency.level === 'soon') {
      immediate++;
    } else if (rec.urgency.level === 'planned') {
      planned++;
    } else {
      monitoring++;
    }
  }

  // Generate key highlights
  const keyHighlights: string[] = [];

  const criticalRecs = recommendations.filter(r => r.priority === 'critical');
  if (criticalRecs.length > 0) {
    keyHighlights.push(
      `${criticalRecs.length} raccomandazione/i richiedono attenzione immediata`
    );
  }

  const securityRecs = recommendations.filter(r =>
    r.stabilityAssessment.costOfNoChange.securityExposure !== 'none' &&
    r.stabilityAssessment.costOfNoChange.securityExposure !== 'low'
  );
  if (securityRecs.length > 0) {
    keyHighlights.push(
      `${securityRecs.length} raccomandazione/i riguardano la sicurezza`
    );
  }

  const replaceRecs = recommendations.filter(r => r.action === 'REPLACE_EXISTING');
  if (replaceRecs.length > 0) {
    keyHighlights.push(
      `${replaceRecs.length} tecnologie esistenti potrebbero essere sostituite`
    );
  }

  // Determine overall risk level
  let overallRiskLevel = 'basso';
  if (criticalRecs.length > 0) {
    overallRiskLevel = 'alto';
  } else if (securityRecs.length > 0 || immediate > 2) {
    overallRiskLevel = 'medio';
  }

  return {
    id: `brief-human-${Date.now()}`,
    projectId,
    projectName,
    generatedAt: new Date().toISOString(),
    recommendations: briefRecs,
    executiveSummary: {
      totalRecommendations: recommendations.length,
      immediate,
      planned,
      monitoring,
      keyHighlights,
      overallRiskLevel,
    },
  };
}

// ============================================================
// RENDERING
// ============================================================

/**
 * Render human brief as Markdown.
 */
export function renderHumanBriefMarkdown(brief: HumanBrief): string {
  const lines: string[] = [];

  lines.push(`# Report Tecnologico: ${brief.projectName}`);
  lines.push('');
  lines.push(`*Generato il ${new Date(brief.generatedAt).toLocaleDateString('it-IT')}*`);
  lines.push('');

  lines.push(`## Riepilogo`);
  lines.push('');
  lines.push(`Abbiamo analizzato le tecnologie emergenti e identificato **${brief.executiveSummary.totalRecommendations} opportunità** per il vostro progetto.`);
  lines.push('');

  lines.push(`| Categoria | Numero |`);
  lines.push(`|-----------|--------|`);
  lines.push(`| Da affrontare subito | ${brief.executiveSummary.immediate} |`);
  lines.push(`| Da pianificare | ${brief.executiveSummary.planned} |`);
  lines.push(`| Da monitorare | ${brief.executiveSummary.monitoring} |`);
  lines.push('');

  if (brief.executiveSummary.keyHighlights.length > 0) {
    lines.push(`### Punti chiave`);
    lines.push('');
    for (const highlight of brief.executiveSummary.keyHighlights) {
      lines.push(`- ${highlight}`);
    }
    lines.push('');
  }

  lines.push(`**Livello di rischio complessivo:** ${brief.executiveSummary.overallRiskLevel}`);
  lines.push('');

  lines.push(`---`);
  lines.push('');

  for (const rec of brief.recommendations) {
    const urgencyIcon = rec.urgency.level === 'immediate' ? '🔴'
      : rec.urgency.level === 'soon' ? '🟠'
      : rec.urgency.level === 'planned' ? '🟡'
      : '🔵';

    lines.push(`## ${urgencyIcon} ${rec.title}`);
    lines.push('');
    lines.push(`**${rec.urgency.label}** | ${rec.verdict.recommendation}`);
    lines.push('');
    lines.push(`> ${rec.oneLiner}`);
    lines.push('');
    lines.push(rec.summary);
    lines.push('');

    lines.push(`### Perché adesso?`);
    lines.push('');
    lines.push(rec.whyNow);
    lines.push('');

    lines.push(`### La nostra valutazione`);
    lines.push('');
    lines.push(rec.verdict.plain);
    lines.push('');

    lines.push(`### Impatto`);
    lines.push('');
    lines.push(`| Aspetto | Valutazione |`);
    lines.push(`|---------|-------------|`);
    lines.push(`| Sicurezza | ${rec.impact.security} |`);
    lines.push(`| Costo | ${rec.impact.cost} |`);
    lines.push(`| Rischio | ${rec.impact.risk} |`);
    lines.push(`| Urgenza | ${rec.impact.urgency} |`);
    lines.push('');

    if (rec.clientTalkingPoints.length > 0) {
      lines.push(`### FAQ`);
      lines.push('');
      for (const tp of rec.clientTalkingPoints) {
        lines.push(`**${tp.point}**`);
        lines.push('');
        lines.push(tp.answer);
        lines.push('');
      }
    }

    lines.push(`---`);
    lines.push('');
  }

  lines.push(`*Report generato da TechScout*`);

  return lines.join('\n');
}

/**
 * Render a compact summary for notifications.
 */
export function renderHumanSummary(brief: HumanBrief): string {
  const lines: string[] = [];

  lines.push(`📋 Report Tecnologico: ${brief.projectName}`);
  lines.push('');
  lines.push(`${brief.executiveSummary.totalRecommendations} raccomandazioni:`);
  lines.push(`• ${brief.executiveSummary.immediate} urgenti`);
  lines.push(`• ${brief.executiveSummary.planned} da pianificare`);
  lines.push(`• ${brief.executiveSummary.monitoring} da monitorare`);
  lines.push('');

  for (const rec of brief.recommendations.slice(0, 3)) {
    const icon = rec.urgency.level === 'immediate' ? '🔴'
      : rec.urgency.level === 'soon' ? '🟠'
      : rec.urgency.level === 'planned' ? '🟡'
      : '🔵';

    lines.push(`${icon} ${rec.title}`);
    lines.push(`   ${rec.oneLiner}`);
  }

  if (brief.recommendations.length > 3) {
    lines.push(`... e altre ${brief.recommendations.length - 3}`);
  }

  return lines.join('\n');
}

/**
 * Render brief as plain text email body.
 */
export function renderHumanBriefEmail(brief: HumanBrief): string {
  const lines: string[] = [];

  lines.push(`REPORT TECNOLOGICO: ${brief.projectName.toUpperCase()}`);
  lines.push(`Generato il ${new Date(brief.generatedAt).toLocaleDateString('it-IT')}`);
  lines.push('');
  lines.push('='.repeat(50));
  lines.push('');

  lines.push(`RIEPILOGO`);
  lines.push('-'.repeat(20));
  lines.push(`Totale raccomandazioni: ${brief.executiveSummary.totalRecommendations}`);
  lines.push(`- Da affrontare subito: ${brief.executiveSummary.immediate}`);
  lines.push(`- Da pianificare: ${brief.executiveSummary.planned}`);
  lines.push(`- Da monitorare: ${brief.executiveSummary.monitoring}`);
  lines.push('');

  if (brief.executiveSummary.keyHighlights.length > 0) {
    lines.push(`PUNTI CHIAVE:`);
    for (const highlight of brief.executiveSummary.keyHighlights) {
      lines.push(`* ${highlight}`);
    }
    lines.push('');
  }

  lines.push('='.repeat(50));
  lines.push('');

  for (const rec of brief.recommendations) {
    const urgencyLabel = rec.urgency.level === 'immediate' ? '[URGENTE]'
      : rec.urgency.level === 'soon' ? '[CONSIGLIATO]'
      : rec.urgency.level === 'planned' ? '[DA PIANIFICARE]'
      : '[DA MONITORARE]';

    lines.push(`${urgencyLabel} ${rec.title}`);
    lines.push('-'.repeat(40));
    lines.push('');
    lines.push(rec.oneLiner);
    lines.push('');
    lines.push(rec.summary);
    lines.push('');
    lines.push(`Perché adesso: ${rec.whyNow}`);
    lines.push('');
    lines.push(`IMPATTO:`);
    lines.push(`- Sicurezza: ${rec.impact.security}`);
    lines.push(`- Costo: ${rec.impact.cost}`);
    lines.push(`- Rischio: ${rec.impact.risk}`);
    lines.push('');
    lines.push('='.repeat(50));
    lines.push('');
  }

  lines.push('');
  lines.push('Report generato da TechScout');
  lines.push('Per ulteriori dettagli, accedi alla dashboard.');

  return lines.join('\n');
}
