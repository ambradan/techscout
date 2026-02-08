/**
 * TechScout — LLM Analyzer (Layer 3, Step 3)
 *
 * Uses Claude API to generate structured analysis for recommendations.
 * Produces IFX-tagged claims, effort estimates, and dual outputs.
 *
 * IMPORTANT: Never sends source code to the LLM.
 * Only sends: metadata, dependency info, CF findings, feed item data.
 */

import Anthropic from '@anthropic-ai/sdk';
import type {
  FeedItem,
  ProjectProfile,
  PreFilterMatch,
  TechnicalOutput,
  HumanFriendlyOutput,
  RecommendationSubject,
  RecommendationAction,
  SubjectMaturity,
  IFXFact,
  IFXInference,
  IFXAssumption,
  CalibratedEffort,
  TechnicalImpact,
  Tradeoffs,
  FailureMode,
  ClientTalkingPoint,
} from '../types';
import { generateTraceId } from '../lib/ifx';
import { logger } from '../lib/logger';
import type { MaturityGateResult } from './maturity';

// ============================================================
// CONFIGURATION
// ============================================================

const MODEL = 'claude-sonnet-4-5-20250929';
const MAX_TOKENS = 4096;

interface AnalyzerConfig {
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

const DEFAULT_CONFIG: Required<AnalyzerConfig> = {
  model: MODEL,
  maxTokens: MAX_TOKENS,
  temperature: 0.3, // Low temperature for consistent structured output
};

// ============================================================
// INPUT TYPES
// ============================================================

export interface AnalyzerInput {
  item: FeedItem;
  profile: ProjectProfile;
  preFilterMatch: PreFilterMatch;
  maturityResult: MaturityGateResult;
  proposedAction: RecommendationAction;
}

export interface AnalyzerOutput {
  subject: RecommendationSubject;
  technical: TechnicalOutput;
  humanFriendly: HumanFriendlyOutput;
  confidence: number;
  modelUsed: string;
  tokensUsed: {
    input: number;
    output: number;
  };
}

// ============================================================
// PROMPT CONSTRUCTION
// ============================================================

function buildSystemPrompt(): string {
  return `You are TechScout's analysis engine. Your role is to evaluate technologies and produce structured recommendations for software projects.

IMPORTANT RULES:
1. You NEVER have access to source code. Base your analysis only on:
   - Dependency manifests and versions
   - Code Forensics findings (metadata about code patterns)
   - Project manifest (declared pain points, constraints)
   - Feed item data (technology info from external sources)

2. All claims MUST be tagged with IFX (Information Flow eXplicitness):
   - FACT: Verifiable without assumptions. Include source and reliability.
   - INFERENCE: Logically derived from FACTs. Include confidence 0-1.
   - ASSUMPTION: Explicit hypothesis that cannot be verified.

3. Bias towards STABILITY:
   - Only recommend changes when cost_of_no_change > cost_of_change
   - Prefer MONITOR over REPLACE for experimental tech
   - Account for team learning curve and migration effort

4. Output must be JSON conforming to the specified schema.
   - Technical output: for developers
   - Human-friendly output: for PM/stakeholders (no jargon)

5. Be conservative with effort estimates. Better to overestimate.`;
}

function buildUserPrompt(input: AnalyzerInput): string {
  const { item, profile, preFilterMatch, maturityResult, proposedAction } = input;

  // Build project context (no source code!)
  const projectContext = {
    name: profile.project.name,
    stack: {
      languages: profile.stack.languages.map(l => ({ name: l.name, percentage: l.percentage, role: l.role })),
      frameworks: profile.stack.frameworks.map(f => ({ name: f.name, version: f.version })),
      keyDependencies: profile.stack.keyDependencies.map(d => ({
        name: d.name,
        version: d.version,
        ecosystem: d.ecosystem,
      })),
    },
    painPoints: profile.manifest.painPoints,
    constraints: profile.manifest.constraints,
    cfFindings: profile.cfFindings.findings.map((f: { id: string; category: string; severity: string; description: string; patternId: string }) => ({
      id: f.id,
      category: f.category,
      severity: f.severity,
      description: f.description,
      patternId: f.patternId,
    })),
    stackHealth: profile.stackHealth.overallScore,
  };

  // Build feed item context
  const itemContext = {
    title: item.title,
    url: item.url,
    description: item.description,
    contentSummary: item.contentSummary,
    categories: item.categories,
    technologies: item.technologies,
    traction: item.traction,
    sourceName: item.sourceName,
    sourceReliability: item.sourceReliability,
  };

  // Build matching context
  const matchContext = {
    matchScore: preFilterMatch.matchScore,
    technologiesMatched: preFilterMatch.technologiesMatched,
    categoriesMatched: preFilterMatch.categoriesMatched,
    matchReasons: preFilterMatch.matchReasons,
  };

  // Build maturity context
  const maturityContext = {
    maturity: maturityResult.subjectMaturity,
    minRequired: maturityResult.minMaturityForAction,
    passed: maturityResult.passed,
    warnings: maturityResult.warnings,
  };

  return `Analyze this technology for potential recommendation to the project.

## PROJECT CONTEXT
\`\`\`json
${JSON.stringify(projectContext, null, 2)}
\`\`\`

## TECHNOLOGY (Feed Item)
\`\`\`json
${JSON.stringify(itemContext, null, 2)}
\`\`\`

## MATCHING CONTEXT
\`\`\`json
${JSON.stringify(matchContext, null, 2)}
\`\`\`

## MATURITY ASSESSMENT
\`\`\`json
${JSON.stringify(maturityContext, null, 2)}
\`\`\`

## PROPOSED ACTION: ${proposedAction}

## INSTRUCTIONS
1. Analyze if this technology would benefit the project
2. Consider the pain points and CF findings - does this help?
3. Estimate effort conservatively (consider learning curve)
4. Identify risks and failure modes
5. Produce both technical and human-friendly outputs

## REQUIRED OUTPUT FORMAT
Return a JSON object with this exact structure:
\`\`\`typescript
{
  "subject": {
    "name": string,
    "type": "library" | "framework" | "platform" | "tool" | "service" | "pattern" | "practice",
    "url": string | null,
    "version": string | null,
    "ecosystem": string | null,
    "license": string | null,
    "maturity": "${maturityResult.subjectMaturity}"
  },
  "technical": {
    "analysis": {
      "facts": [
        {
          "ifxTag": "FACT",
          "claim": string,
          "source": string,
          "sourceReliability": "high" | "medium" | "low",
          "sourceUrl": string | null,
          "cfFindingId": string | null
        }
      ],
      "inferences": [
        {
          "ifxTag": "INFERENCE",
          "claim": string,
          "derivedFrom": string[],
          "confidence": number  // 0-1
        }
      ],
      "assumptions": [
        {
          "ifxTag": "ASSUMPTION",
          "claim": string
        }
      ]
    },
    "effort": {
      "rawEstimateDays": string,  // e.g., "2-3"
      "complexity": "trivial" | "low" | "medium" | "high" | "very_high",
      "breakingChanges": boolean,
      "reversibility": "easy" | "medium" | "hard" | "irreversible",
      "steps": string[]
    },
    "impact": {
      "security": { "scoreChange": string, "detail": string },
      "performance": { "scoreChange": string, "detail": string },
      "maintainability": { "scoreChange": string, "detail": string },
      "cost": { "scoreChange": string, "detail": string },
      "risk": { "level": "none" | "low" | "medium" | "high" | "critical", "detail": string }
    },
    "tradeoffs": {
      "gains": string[],
      "losses": string[]
    },
    "failureModes": [
      {
        "mode": string,
        "probability": "low" | "medium" | "high",
        "mitigation": string
      }
    ],
    "limitations": string[]
  },
  "humanFriendly": {
    "title": string,  // No jargon, understandable by non-tech
    "oneLiner": string,  // 1 sentence summary
    "summary": string,  // 2-3 paragraphs for PM
    "whyNow": string,  // Why this timing matters
    "clientTalkingPoints": [
      { "point": string, "answer": string }
    ],
    "impactSummary": {
      "security": string,
      "costo": string,
      "rischio": string,
      "urgenza": string
    }
  },
  "confidence": number  // Overall confidence 0-1
}
\`\`\`

Respond ONLY with valid JSON. No markdown, no explanation.`;
}

// ============================================================
// RESPONSE PARSING
// ============================================================

interface RawAnalysis {
  subject: {
    name: string;
    type: string;
    url: string | null;
    version: string | null;
    ecosystem: string | null;
    license: string | null;
    maturity: string;
  };
  technical: {
    analysis: {
      facts: Array<{
        ifxTag: string;
        claim: string;
        source: string;
        sourceReliability: string;
        sourceUrl?: string | null;
        cfFindingId?: string | null;
      }>;
      inferences: Array<{
        ifxTag: string;
        claim: string;
        derivedFrom: string[];
        confidence: number;
      }>;
      assumptions: Array<{
        ifxTag: string;
        claim: string;
      }>;
    };
    effort: {
      rawEstimateDays: string;
      complexity: string;
      breakingChanges: boolean;
      reversibility: string;
      steps: string[];
    };
    impact: {
      security: { scoreChange: string; detail: string };
      performance: { scoreChange: string; detail: string };
      maintainability: { scoreChange: string; detail: string };
      cost: { scoreChange: string; detail: string };
      risk: { level: string; detail: string };
    };
    tradeoffs: {
      gains: string[];
      losses: string[];
    };
    failureModes: Array<{
      mode: string;
      probability: string;
      mitigation: string;
    }>;
    limitations: string[];
  };
  humanFriendly: {
    title: string;
    oneLiner: string;
    summary: string;
    whyNow: string;
    clientTalkingPoints: Array<{ point: string; answer: string }>;
    impactSummary: {
      security: string;
      costo: string;
      rischio: string;
      urgenza: string;
    };
  };
  confidence: number;
}

function parseAnalysisResponse(
  text: string,
  input: AnalyzerInput
): AnalyzerOutput {
  // Extract JSON from response
  let json: RawAnalysis;
  try {
    // Try to parse directly
    json = JSON.parse(text);
  } catch {
    // Try to extract JSON from markdown code blocks
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      json = JSON.parse(jsonMatch[1]);
    } else {
      throw new Error('Could not parse JSON from response');
    }
  }

  // Convert to typed output
  const subject: RecommendationSubject = {
    name: json.subject.name,
    type: json.subject.type as RecommendationSubject['type'],
    url: json.subject.url ?? undefined,
    version: json.subject.version ?? undefined,
    ecosystem: json.subject.ecosystem ?? undefined,
    license: json.subject.license ?? undefined,
    maturity: json.subject.maturity as SubjectMaturity,
    traction: {
      githubStars: input.item.traction.githubStars,
      githubStars30dGrowth: input.item.traction.githubStars30dGrowth,
      npmWeeklyDownloads: input.item.traction.npmWeeklyDownloads,
    },
  };

  const facts: IFXFact[] = json.technical.analysis.facts.map(f => ({
    ifxTag: 'FACT' as const,
    claim: f.claim,
    source: f.source,
    sourceReliability: f.sourceReliability as IFXFact['sourceReliability'],
    sourceUrl: f.sourceUrl ?? undefined,
    cfFindingId: f.cfFindingId ?? undefined,
  }));

  const inferences: IFXInference[] = json.technical.analysis.inferences.map(i => ({
    ifxTag: 'INFERENCE' as const,
    claim: i.claim,
    derivedFrom: i.derivedFrom,
    confidence: i.confidence,
  }));

  const assumptions: IFXAssumption[] = json.technical.analysis.assumptions.map(a => ({
    ifxTag: 'ASSUMPTION' as const,
    claim: a.claim,
  }));

  const effort: CalibratedEffort = {
    rawEstimateDays: json.technical.effort.rawEstimateDays,
    calibrationApplied: false, // Will be set by stability gate
    calibratedEstimateDays: json.technical.effort.rawEstimateDays,
    complexity: json.technical.effort.complexity as CalibratedEffort['complexity'],
    breakingChanges: json.technical.effort.breakingChanges,
    reversibility: json.technical.effort.reversibility as CalibratedEffort['reversibility'],
    steps: json.technical.effort.steps,
  };

  const impact: TechnicalImpact = {
    security: json.technical.impact.security,
    performance: json.technical.impact.performance,
    maintainability: json.technical.impact.maintainability,
    cost: json.technical.impact.cost,
    risk: {
      level: json.technical.impact.risk.level as TechnicalImpact['risk']['level'],
      detail: json.technical.impact.risk.detail,
    },
  };

  const tradeoffs: Tradeoffs = json.technical.tradeoffs;

  const failureModes: FailureMode[] = json.technical.failureModes.map(f => ({
    mode: f.mode,
    probability: f.probability as FailureMode['probability'],
    mitigation: f.mitigation,
  }));

  const technical: TechnicalOutput = {
    analysis: { facts, inferences, assumptions },
    effort,
    impact,
    tradeoffs,
    failureModes,
    limitations: json.technical.limitations,
  };

  const clientTalkingPoints: ClientTalkingPoint[] = json.humanFriendly.clientTalkingPoints;

  const humanFriendly: HumanFriendlyOutput = {
    title: json.humanFriendly.title,
    oneLiner: json.humanFriendly.oneLiner,
    summary: json.humanFriendly.summary,
    whyNow: json.humanFriendly.whyNow,
    clientTalkingPoints,
    impactSummary: json.humanFriendly.impactSummary,
  };

  return {
    subject,
    technical,
    humanFriendly,
    confidence: json.confidence,
    modelUsed: DEFAULT_CONFIG.model,
    tokensUsed: { input: 0, output: 0 }, // Will be filled by caller
  };
}

// ============================================================
// MAIN ANALYZER
// ============================================================

let anthropicClient: Anthropic | null = null;

function getClient(): Anthropic {
  if (!anthropicClient) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY not set');
    }
    anthropicClient = new Anthropic({ apiKey });
  }
  return anthropicClient;
}

/**
 * Analyze a feed item against a project profile.
 */
export async function analyzeItem(
  input: AnalyzerInput,
  config: AnalyzerConfig = {}
): Promise<AnalyzerOutput> {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };
  const traceId = generateTraceId('LLM');

  logger.info('Starting LLM analysis', {
    traceId,
    itemTitle: input.item.title,
    projectId: input.profile.project.id,
    proposedAction: input.proposedAction,
  });

  const client = getClient();

  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildUserPrompt(input);

  try {
    const response = await client.messages.create({
      model: mergedConfig.model,
      max_tokens: mergedConfig.maxTokens,
      temperature: mergedConfig.temperature,
      system: systemPrompt,
      messages: [
        { role: 'user', content: userPrompt },
      ],
    });

    // Extract text content
    const textContent = response.content.find(c => c.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      throw new Error('No text content in response');
    }

    const output = parseAnalysisResponse(textContent.text, input);

    // Fill in token usage
    output.tokensUsed = {
      input: response.usage.input_tokens,
      output: response.usage.output_tokens,
    };
    output.modelUsed = mergedConfig.model;

    logger.info('LLM analysis completed', {
      traceId,
      confidence: output.confidence,
      tokensUsed: output.tokensUsed.input + output.tokensUsed.output,
    });

    return output;
  } catch (error) {
    logger.error('LLM analysis failed', {
      traceId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Batch analyze multiple items.
 * Processes sequentially to avoid rate limits.
 */
export async function analyzeBatch(
  inputs: AnalyzerInput[],
  config: AnalyzerConfig = {}
): Promise<Map<string, AnalyzerOutput>> {
  const results = new Map<string, AnalyzerOutput>();

  logger.info('Starting batch LLM analysis', { itemCount: inputs.length });

  for (const input of inputs) {
    try {
      const output = await analyzeItem(input, config);
      results.set(input.item.id, output);
    } catch (error) {
      logger.warn('Item analysis failed, skipping', {
        itemId: input.item.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  logger.info('Batch LLM analysis completed', {
    total: inputs.length,
    succeeded: results.size,
    failed: inputs.length - results.size,
  });

  return results;
}

/**
 * Quick relevance check without full analysis.
 * Uses smaller prompt to determine if item warrants full analysis.
 */
export async function quickRelevanceCheck(
  item: FeedItem,
  profile: ProjectProfile
): Promise<{ relevant: boolean; reason: string; confidence: number }> {
  const client = getClient();

  const prompt = `Given this technology:
Name: ${item.title}
Description: ${item.description || 'N/A'}
Categories: ${item.categories.join(', ')}
Technologies: ${item.technologies.join(', ')}

And this project stack:
Languages: ${profile.stack.languages.map(l => l.name).join(', ')}
Frameworks: ${profile.stack.frameworks.map(f => f.name).join(', ')}
Pain points: ${profile.manifest.painPoints.join('; ')}

Is this technology relevant to this project?
Respond with JSON: {"relevant": boolean, "reason": "1-2 sentences", "confidence": 0.0-1.0}`;

  try {
    const response = await client.messages.create({
      model: 'claude-3-haiku-20240307', // Use Haiku for quick checks
      max_tokens: 256,
      temperature: 0.1,
      messages: [{ role: 'user', content: prompt }],
    });

    const textContent = response.content.find(c => c.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      return { relevant: false, reason: 'No response', confidence: 0 };
    }

    const result = JSON.parse(textContent.text);
    return {
      relevant: result.relevant ?? false,
      reason: result.reason ?? '',
      confidence: result.confidence ?? 0.5,
    };
  } catch (error) {
    logger.warn('Quick relevance check failed', {
      itemId: item.id,
      error: error instanceof Error ? error.message : String(error),
    });
    return { relevant: true, reason: 'Check failed, assuming relevant', confidence: 0.3 };
  }
}
