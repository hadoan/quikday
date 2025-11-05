/**
 * Example: Using the Modular Prompt System
 * 
 * This demonstrates how to use the new modular prompt system
 * for goal extraction with domain-specific rules and validation.
 * 
 * Run: pnpm tsx packages/agent/examples/modular-prompt-demo.ts
 */

import { 
  compileGoalExtractionPrompt,
  compileGoalUserPrompt,
  detectDomains,
  GoalSchema
} from '../prompts/goal-extraction/index.js';

import { 
  validateEmail,
  filterIntegrationPolicyQuestions,
  repairJsonOutput
} from '../guards/index.js';

// Example user inputs
const examples = [
  'Schedule a call with jane@acme.com tomorrow at 3pm for 30 minutes',
  'Draft follow-up emails for no-reply threads from the last 7 days',
  'Post to LinkedIn about our new feature',
  'Give me a 10-minute triage of priority emails and create quick-reply drafts (max 8)',
  'Check my availability for a 1-hour meeting next Tuesday',
];

console.log('='.repeat(80));
console.log('Modular Prompt System Demo');
console.log('='.repeat(80));
console.log();

// Demo 1: Basic prompt compilation
console.log('📝 Demo 1: Basic Prompt Compilation');
console.log('-'.repeat(80));

const userInput = examples[0];
console.log(`User Input: "${userInput}"\n`);

// Detect domains
const domains = detectDomains(userInput);
console.log(`Detected Domains: ${domains.join(', ')}\n`);

// Compile system prompt
const systemPrompt = compileGoalExtractionPrompt({
  connectedApps: ['gmail', 'google-calendar'],
  domains,
  includeExamples: true,
  version: 'v1',
});

console.log(`System Prompt Length: ${systemPrompt.length} chars (~${Math.ceil(systemPrompt.length / 4)} tokens)\n`);

// Build user prompt
const userPrompt = compileGoalUserPrompt(userInput, {}, {
  timezone: 'America/New_York',
  todayISO: new Date().toISOString(),
});

console.log(`User Prompt Length: ${userPrompt.length} chars\n`);
console.log();

// Demo 2: Compare token savings
console.log('📊 Demo 2: Token Savings Comparison');
console.log('-'.repeat(80));

const allDomainsPrompt = compileGoalExtractionPrompt({
  domains: ['email', 'calendar', 'social', 'messaging'],
  includeExamples: true,
});

const singleDomainPrompt = compileGoalExtractionPrompt({
  domains: ['email'],
  includeExamples: true,
});

const noDomainPrompt = compileGoalExtractionPrompt({
  domains: [],
  includeExamples: false,
});

console.log(`All Domains:    ${allDomainsPrompt.length} chars (~${Math.ceil(allDomainsPrompt.length / 4)} tokens)`);
console.log(`Single Domain:  ${singleDomainPrompt.length} chars (~${Math.ceil(singleDomainPrompt.length / 4)} tokens)`);
console.log(`Core Only:      ${noDomainPrompt.length} chars (~${Math.ceil(noDomainPrompt.length / 4)} tokens)`);

const savings = Math.round(((allDomainsPrompt.length - singleDomainPrompt.length) / allDomainsPrompt.length) * 100);
console.log(`\nToken Savings: ~${savings}% when using single domain vs all domains\n`);
console.log();

// Demo 3: Domain detection
console.log('🔍 Demo 3: Domain Detection');
console.log('-'.repeat(80));

examples.forEach((input, i) => {
  const detected = detectDomains(input);
  console.log(`${i + 1}. "${input.slice(0, 60)}${input.length > 60 ? '...' : ''}"`);
  console.log(`   Domains: ${detected.join(', ') || 'none'}\n`);
});
console.log();

// Demo 4: Validation
console.log('✅ Demo 4: Code-Based Validation');
console.log('-'.repeat(80));

const testEmails = [
  'jane@acme.com',
  'invalid.email',
  'test@example',
  'good.email@domain.co.uk',
];

console.log('Email Validation:');
testEmails.forEach(email => {
  const result = validateEmail(email);
  console.log(`  ${result.valid ? '✓' : '✗'} ${email} ${result.error ? `(${result.error})` : ''}`);
});
console.log();

// Demo 5: Integration policy filtering
console.log('🔒 Demo 5: Integration Policy Enforcement');
console.log('-'.repeat(80));

const missingFields = [
  { key: 'email_account', question: 'Which email account?', type: 'string', required: true },
  { key: 'content', question: 'What should the email say?', type: 'text', required: true },
  { key: 'recipient', question: 'Who should receive the email?', type: 'email', required: true },
];

console.log('Before filtering:');
missingFields.forEach(field => console.log(`  - ${field.key}: ${field.question}`));

const filtered = filterIntegrationPolicyQuestions(missingFields, ['gmail']);

console.log('\nAfter filtering (gmail connected):');
filtered.forEach(field => console.log(`  - ${field.key}: ${field.question}`));
console.log();

// Demo 6: JSON repair
console.log('🔧 Demo 6: JSON Output Repair');
console.log('-'.repeat(80));

const dirtyOutputs = [
  '```json\n{"outcome": "test"}\n```',
  'Here is the JSON: {"outcome": "test"}',
  '{"outcome": "test"}',
];

console.log('Repairing LLM outputs with markdown fences:\n');
dirtyOutputs.forEach((dirty, i) => {
  const clean = repairJsonOutput(dirty);
  console.log(`${i + 1}. Input:  ${dirty.replace(/\n/g, '\\n')}`);
  console.log(`   Output: ${clean}\n`);
});

console.log('='.repeat(80));
console.log('✨ Demo Complete!');
console.log('='.repeat(80));
console.log();
console.log('Next Steps:');
console.log('1. Review the modular prompt files in packages/agent/prompts/goal-extraction/');
console.log('2. Check out the validators in packages/agent/guards/validators.ts');
console.log('3. Add test cases to packages/agent/evaluation/golden-utterances.ts');
console.log('4. Implement eval runner in packages/agent/evaluation/framework.ts');
console.log();
