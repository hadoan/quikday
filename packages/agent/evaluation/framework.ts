/**
 * Evaluation Framework for Prompt Engineering
 * Tests golden utterances against prompt versions to ensure quality
 */

import { z } from 'zod';
import { GoalSchema } from '../prompts/goal-extraction/schema.js';

/**
 * A golden utterance test case
 */
export const GoldenUtteranceSchema = z.object({
  id: z.string(),
  input: z.string().describe('User prompt/utterance'),
  expectedOutcome: z.string().describe('Expected outcome extraction'),
  expectedProvided: z.record(z.string(), z.unknown()).optional(),
  expectedMissing: z.array(z.string()).optional().describe('Expected missing field keys'),
  minConfidence: z.number().min(0).max(1).optional().default(0.7),
  domains: z.array(z.string()).optional(),
  notes: z.string().optional(),
});

export type GoldenUtterance = z.infer<typeof GoldenUtteranceSchema>;

/**
 * Evaluation result for a single test case
 */
export interface EvalResult {
  id: string;
  passed: boolean;
  actualOutput: z.infer<typeof GoalSchema>;
  errors: string[];
  metrics: {
    validJson: boolean;
    schemaPass: boolean;
    outcomeMatch: boolean;
    confidencePass: boolean;
    missingFieldsAccuracy: number;
    promptLength: number;
  };
}

/**
 * Aggregate evaluation metrics
 */
export interface EvalMetrics {
  totalTests: number;
  passed: number;
  failed: number;
  validJsonRate: number;
  schemaPassRate: number;
  outcomeMatchRate: number;
  avgConfidence: number;
  avgPromptLength: number;
  failedTests: Array<{ id: string; errors: string[] }>;
}

/**
 * Run evaluation on a set of golden utterances
 *
 * Usage:
 * ```typescript
 * const results = await runEvaluation(goldenUtterances, {
 *   version: 'v1',
 *   connectedApps: ['gmail', 'google-calendar'],
 * });
 * ```
 */
export async function runEvaluation(
  utterances: GoldenUtterance[],
  options: {
    version?: string;
    connectedApps?: string[];
    llm?: any; // LLM instance
  },
): Promise<{ results: EvalResult[]; metrics: EvalMetrics }> {
  // TODO: Implement evaluation logic
  // 1. For each utterance, compile prompt with options
  // 2. Call LLM to extract goal
  // 3. Validate against expected output
  // 4. Compute metrics

  throw new Error('Not implemented yet - stub for future evaluation system');
}

/**
 * Compare two prompt versions
 */
export async function comparePromptVersions(
  utterances: GoldenUtterance[],
  versionA: string,
  versionB: string,
  options: { connectedApps?: string[]; llm?: any },
): Promise<{
  versionA: EvalMetrics;
  versionB: EvalMetrics;
  winner: string;
  improvements: string[];
  regressions: string[];
}> {
  // TODO: Implement A/B comparison logic
  throw new Error('Not implemented yet - stub for future A/B testing');
}

/**
 * Generate report from evaluation results
 */
export function generateEvalReport(metrics: EvalMetrics): string {
  return [
    '# Evaluation Report',
    '',
    `**Total Tests:** ${metrics.totalTests}`,
    `**Passed:** ${metrics.passed} (${((metrics.passed / metrics.totalTests) * 100).toFixed(1)}%)`,
    `**Failed:** ${metrics.failed}`,
    '',
    '## Metrics',
    `- Valid JSON Rate: ${(metrics.validJsonRate * 100).toFixed(1)}%`,
    `- Schema Pass Rate: ${(metrics.schemaPassRate * 100).toFixed(1)}%`,
    `- Outcome Match Rate: ${(metrics.outcomeMatchRate * 100).toFixed(1)}%`,
    `- Avg Confidence: ${metrics.avgConfidence.toFixed(2)}`,
    `- Avg Prompt Length: ${metrics.avgPromptLength} chars`,
    '',
    '## Failed Tests',
    ...metrics.failedTests.map((t) => `- **${t.id}**: ${t.errors.join(', ')}`),
  ].join('\n');
}
