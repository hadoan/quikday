/**
 * Central exports for goal extraction modular prompt system
 */

// Schema
export { GoalSchema, type GoalExtraction } from './schema.js';

// Compiler
export { 
  compileGoalExtractionPrompt,
  compileGoalUserPrompt,
  detectDomains,
  type PromptCompilerOptions 
} from './compiler.js';

// Core modules (for advanced usage/testing)
export { GOAL_EXTRACTION_CORE_V1 } from './v1-core-contract.js';
export { FORMAT_RULES_V1 } from './v1-format-rules.js';
export { INTEGRATION_POLICY_V1 } from './v1-integration-policy.js';
export { GOAL_EXTRACTION_EXAMPLES_V1 } from './v1-examples.js';

// Domain rules (for advanced usage/testing)
export { EMAIL_DOMAIN_RULES_V1 } from './domains/email-v1.js';
export { CALENDAR_DOMAIN_RULES_V1 } from './domains/calendar-v1.js';
export { SOCIAL_DOMAIN_RULES_V1 } from './domains/social-v1.js';
export { MESSAGING_DOMAIN_RULES_V1 } from './domains/messaging-v1.js';
