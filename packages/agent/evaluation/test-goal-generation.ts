/**
 * Test Goal Generation for All Golden Utterances
 * 
 * This script runs the goal extraction system against all test cases
 * using the real ChatGPT API to validate the modular prompt system.
 * 
 * Usage:
 * ```bash
 * pnpm tsx packages/agent/evaluation/test-goal-generation.ts
 * ```
 */

import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load .env from project root (3 levels up from this file)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..', '..', '..');
config({ path: join(projectRoot, '.env') });

import { GOLDEN_UTTERANCES } from './golden-utterances.js';
import { 
  compileGoalExtractionPrompt,
  compileGoalUserPrompt,
  detectDomains,
  GoalSchema
} from '../prompts/goal-extraction/index.js';
import { repairJsonOutput } from '../guards/index.js';
import OpenAI from 'openai';

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

interface TestResult {
  id: string;
  input: string;
  success: boolean;
  goal?: any;
  error?: string;
  domains: string[];
  promptLength: number;
  duration: number;
  validation?: {
    outcomeMatch: boolean;
    domainMatch: boolean;
    confidenceOk: boolean;
    allPassed: boolean;
  };
}

/**
 * Validate extracted goal against expected outcomes
 */
function validateExtraction(
  result: any,
  expected: typeof GOLDEN_UTTERANCES[0],
  detectedDomains: string[]
): { outcomeMatch: boolean; domainMatch: boolean; confidenceOk: boolean; allPassed: boolean } {
  // Check outcome similarity - require multiple key words to match
  const expectedWords = expected.expectedOutcome.toLowerCase().split(' ')
    .filter(word => word.length > 3 && !['about', 'with', 'from', 'that', 'this', 'should'].includes(word));
  const actualOutcome = result.outcome.toLowerCase();
  
  // Count how many expected words appear in actual outcome
  const matchedWords = expectedWords.filter(word => actualOutcome.includes(word));
  const matchRatio = matchedWords.length / expectedWords.length;
  
  // Require at least 50% of key words to match
  const outcomeMatch = matchRatio >= 0.5;
  
  // Check domain detection - all expected domains must be present
  const domainMatch = expected.domains.every(d => detectedDomains.includes(d));
  
  // Check confidence threshold
  const confidenceOk = result.confidence >= expected.minConfidence;
  
  const allPassed = outcomeMatch && domainMatch && confidenceOk;
  
  return { outcomeMatch, domainMatch, confidenceOk, allPassed };
}

/**
 * Test goal extraction for a single utterance
 */
async function testGoalGeneration(utterance: typeof GOLDEN_UTTERANCES[0]): Promise<TestResult> {
  const startTime = Date.now();
  
  try {
    // Detect domains
    const domains = detectDomains(utterance.input);
    
    // Compile system prompt
    const systemPrompt = compileGoalExtractionPrompt({
      connectedApps: ['gmail', 'google-calendar', 'slack'],
      domains,
      includeExamples: true,
      version: 'v1',
    });
    
    // Build user prompt with Berlin timezone
    const userPrompt = compileGoalUserPrompt(utterance.input, {}, {
      timezone: 'Europe/Berlin',
      todayISO: new Date().toISOString(),
    });
    
    // Call ChatGPT API
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0,
      max_tokens: 800,
    });
    
    const rawOutput = response.choices[0]?.message?.content || '';
    
    // Repair and parse JSON
    const json = repairJsonOutput(rawOutput);
    const parsed = GoalSchema.parse(JSON.parse(json));
    
    const duration = Date.now() - startTime;
    
    // Validate extraction against expected outcomes
    const validation = validateExtraction(parsed, utterance, domains);
    
    return {
      id: utterance.id,
      input: utterance.input,
      success: true,
      goal: parsed,
      domains,
      promptLength: systemPrompt.length,
      duration,
      validation,
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    return {
      id: utterance.id,
      input: utterance.input,
      success: false,
      error: error instanceof Error ? error.message : String(error),
      domains: detectDomains(utterance.input),
      promptLength: 0,
      duration,
    };
  }
}


/**
 * Run tests on all golden utterances
 */
async function runAllTests() {
  console.log('='.repeat(80));
  console.log('Goal Generation Test Suite');
  console.log('='.repeat(80));
  console.log();
  console.log(`Total test cases: ${GOLDEN_UTTERANCES.length}`);
  console.log(`Timezone: Europe/Berlin`);
  console.log(`Model: gpt-4o-mini`);
  console.log();
  
  if (!process.env.OPENAI_API_KEY) {
    console.error('❌ Error: OPENAI_API_KEY environment variable is not set');
    console.error('Please set it in your .env file or environment');
    process.exit(1);
  }
  
  const results: TestResult[] = [];
  let successCount = 0;
  let failCount = 0;
  
  // Run tests sequentially to avoid rate limits
  for (let i = 0; i < GOLDEN_UTTERANCES.length; i++) {
    const utterance = GOLDEN_UTTERANCES[i];
    console.log('='.repeat(80));
    console.log(`[${i + 1}/${GOLDEN_UTTERANCES.length}] Test: ${utterance.id}`);
    console.log('='.repeat(80));
    console.log(`Input: "${utterance.input}"`);
    console.log();
    console.log('Expected:');
    console.log(`  Outcome: ${utterance.expectedOutcome}`);
    console.log(`  Domains: ${utterance.domains.join(', ')}`);
    console.log(`  Min Confidence: ${utterance.minConfidence}`);
    console.log(`  Expected Provided Fields:`);
    Object.entries(utterance.expectedProvided).forEach(([key, value]) => {
      console.log(`    - ${key}: ${JSON.stringify(value)}`);
    });
    console.log(`  Expected Missing Fields: ${utterance.expectedMissing.length > 0 ? utterance.expectedMissing.join(', ') : 'none'}`);
    console.log();
    
    const result = await testGoalGeneration(utterance);
    results.push(result);
    
    console.log('Actual:');
    if (result.success) {
      console.log(`  Status: ✅ Success (${result.duration}ms)`);
      console.log(`  Outcome: ${result.goal.outcome}`);
      console.log(`  Confidence: ${result.goal.confidence}`);
      console.log(`  Domains (detected): ${result.domains.join(', ')}`);
      console.log(`  Provided Fields:`);
      Object.entries(result.goal.provided).forEach(([key, value]) => {
        console.log(`    - ${key}: ${JSON.stringify(value)}`);
      });
      console.log(`  Missing Fields: ${result.goal.missing?.length > 0 ? result.goal.missing.join(', ') : 'none'}`);
      console.log(`  Prompt Length: ${result.promptLength} chars (~${Math.ceil(result.promptLength / 4)} tokens)`);
      console.log();
      
      // Validation checks
      console.log('Validation:');
      const v = result.validation!;
      console.log(`  ✓ Outcome match: ${v.outcomeMatch ? '✅ PASS' : '❌ FAIL'}`);
      if (!v.outcomeMatch) {
        console.log(`    (Expected words in outcome, got completely different goal)`);
      }
      console.log(`  ✓ Domain match: ${v.domainMatch ? '✅ PASS' : '❌ FAIL'}`);
      if (!v.domainMatch) {
        console.log(`    (Expected: ${utterance.domains.join(', ')} / Got: ${result.domains.join(', ')})`);
      }
      console.log(`  ✓ Confidence OK: ${v.confidenceOk ? '✅ PASS' : '❌ FAIL'}`);
      console.log(`  → Overall: ${v.allPassed ? '✅ VALID' : '⚠️  INVALID'}`);
      
      if (v.allPassed) {
        successCount++;
      } else {
        failCount++;
        console.log();
        console.log('  ⚠️  WARNING: Extraction does not match expectations!');
      }
    } else {
      failCount++;
      console.log(`  Status: ❌ Failed`);
      console.log(`  Error: ${result.error}`);
      console.log(`  Duration: ${result.duration}ms`);
    }
    console.log();
    
    // Small delay to avoid rate limits
    if (i < GOLDEN_UTTERANCES.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  
  console.log('='.repeat(80));
  console.log('Test Summary');
  console.log('='.repeat(80));
  console.log(`Total Tests: ${GOLDEN_UTTERANCES.length}`);
  console.log(`✅ Valid Extractions: ${successCount} (${((successCount / GOLDEN_UTTERANCES.length) * 100).toFixed(1)}%)`);
  console.log(`❌ Invalid/Failed: ${failCount} (${((failCount / GOLDEN_UTTERANCES.length) * 100).toFixed(1)}%)`);
  console.log();
  
  // Calculate metrics
  const successfulResults = results.filter(r => r.success);
  if (successfulResults.length > 0) {
    const avgDuration = successfulResults.reduce((sum, r) => sum + r.duration, 0) / successfulResults.length;
    const avgPromptLength = successfulResults.reduce((sum, r) => sum + r.promptLength, 0) / successfulResults.length;
    const avgConfidence = successfulResults.reduce((sum, r) => sum + (r.goal?.confidence || 0), 0) / successfulResults.length;
    
    console.log('Performance Metrics:');
    console.log(`  Avg Duration: ${avgDuration.toFixed(0)}ms`);
    console.log(`  Avg Prompt Length: ${avgPromptLength.toFixed(0)} chars (~${Math.ceil(avgPromptLength / 4)} tokens)`);
    console.log(`  Avg Confidence: ${avgConfidence.toFixed(2)}`);
    console.log();
    
    // Validation breakdown
    const validatedResults = successfulResults.filter(r => r.validation);
    const outcomePassCount = validatedResults.filter(r => r.validation!.outcomeMatch).length;
    const domainPassCount = validatedResults.filter(r => r.validation!.domainMatch).length;
    const confidencePassCount = validatedResults.filter(r => r.validation!.confidenceOk).length;
    
    console.log('Validation Metrics:');
    console.log(`  Outcome Accuracy: ${outcomePassCount}/${validatedResults.length} (${((outcomePassCount / validatedResults.length) * 100).toFixed(1)}%)`);
    console.log(`  Domain Accuracy: ${domainPassCount}/${validatedResults.length} (${((domainPassCount / validatedResults.length) * 100).toFixed(1)}%)`);
    console.log(`  Confidence Threshold: ${confidencePassCount}/${validatedResults.length} (${((confidencePassCount / validatedResults.length) * 100).toFixed(1)}%)`);
    console.log();
  }
  
  // Show failures if any
  if (failCount > 0) {
    console.log('Failed/Invalid Tests:');
    results.forEach(r => {
      if (!r.success) {
        console.log(`  - [${r.id}] JSON/Schema Error: ${r.error}`);
      } else if (r.validation && !r.validation.allPassed) {
        console.log(`  - [${r.id}] Validation Failed:`);
        if (!r.validation.outcomeMatch) console.log(`      ❌ Outcome mismatch`);
        if (!r.validation.domainMatch) console.log(`      ❌ Domain mismatch (expected: ${GOLDEN_UTTERANCES.find(u => u.id === r.id)?.domains.join(', ')}, got: ${r.domains.join(', ')})`);
        if (!r.validation.confidenceOk) console.log(`      ❌ Low confidence (${r.goal?.confidence})`);
      }
    });
    console.log();
  }
  
  // Domain distribution
  const domainCounts = new Map<string, number>();
  results.forEach(r => {
    r.domains.forEach(d => {
      domainCounts.set(d, (domainCounts.get(d) || 0) + 1);
    });
  });
  
  console.log('Domain Distribution:');
  Array.from(domainCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .forEach(([domain, count]) => {
      console.log(`  ${domain}: ${count} tests`);
    });
  console.log();
  
  console.log('='.repeat(80));
  console.log('Test Complete!');
  console.log('='.repeat(80));
  
  // Save results to file
  const fs = await import('fs/promises');
  const path = await import('path');
  const outputPath = path.join(import.meta.dirname || '.', 'test-results.json');
  await fs.writeFile(outputPath, JSON.stringify(results, null, 2));
  console.log(`\nResults saved to: ${outputPath}`);
}

// Run tests
runAllTests().catch(console.error);
runAllTests().catch(console.error);
