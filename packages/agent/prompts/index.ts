/**
 * Central export for all agent prompts
 */
export { buildClassifySystemPrompt } from './CLASSIFY_SYSTEM.js';
export { buildClassifyUserPrompt } from './CLASSIFY_USER_PROMPT.js';
export { DEFAULT_ASSISTANT_SYSTEM } from './DEFAULT_ASSISTANT_SYSTEM.js';
export { PLANNER_SYSTEM } from './PLANNER_SYSTEM.js';
export { SUMMARIZE_SYSTEM } from './SUMMARIZE_SYSTEM.js';
export { FOLLOWUP_EMAIL_SYSTEM } from './FOLLOWUP_EMAIL_SYSTEM.js';
export { FOLLOWUP_EMAIL_USER_PROMPT } from './FOLLOWUP_EMAIL_USER_PROMPT.js';

// Goal extraction modular system
export { GoalSchema, type GoalExtraction } from './goal-extraction/schema.js';
export { 
  compileGoalExtractionPrompt, 
  compileGoalUserPrompt,
  detectDomains 
} from './goal-extraction/compiler.js';
