import type { Node } from '../runtime/graph.js';
import type { RunState } from '../state/types.js';
import type { LLM } from '../llm/types.js';
import { GoalSchema, type GoalExtraction } from '../prompts/goal-extraction/schema.js';
import { 
  compileGoalExtractionPrompt, 
  compileGoalUserPrompt,
  detectDomains 
} from '../prompts/goal-extraction/compiler.js';
import { 
  validateEmail, 
  validateDateTime, 
  filterIntegrationPolicyQuestions,
  repairJsonOutput 
} from '../guards/validators.js';

/**
 * Goal extraction node factory
 * Uses modular prompt system with domain-specific rules
 */
export const makeExtractGoal = (llm: LLM): Node<RunState> => {
  return async (s) => {
    const userPrompt = s.input.prompt ?? s.input.messages?.map((m) => m.content).join('\n') ?? '';

    if (!userPrompt.trim()) {
      return {
        scratch: {
          ...s.scratch,
          goal: {
            outcome: 'No input provided',
            confidence: 0,
            provided: {},
            missing: [{ key: 'prompt', question: 'What would you like me to do?', type: 'text', required: true }],
          },
        },
      };
    }

    const answers = (s.scratch?.answers ?? {}) as Record<string, unknown>;
    const todayISO = (s.ctx.now instanceof Date ? s.ctx.now : new Date()).toISOString();
    const tz = s.ctx.tz || 'UTC';

    // Detect domains from user input
    const domains = detectDomains(userPrompt);
    
    // Get connected apps from context (if available) - fallback to empty array
    // In production, this would come from the user's connected integrations
    const connectedApps: string[] = [];
    
    // Compile system prompt with only relevant domain rules
    const system = compileGoalExtractionPrompt({
      connectedApps,
      domains,
      includeExamples: true,
    });
    
    const user = compileGoalUserPrompt(userPrompt, answers, { timezone: tz, todayISO });

    try {
      const raw = await llm.text({
        system,
        user,
        temperature: 0,
        maxTokens: 800,
        timeoutMs: 12_000,
      });

      // Repair and extract JSON safely
      const json = repairJsonOutput(raw);
      let parsed = GoalSchema.parse(JSON.parse(json));

      // Apply code-based guardrails
      if (parsed.missing && parsed.missing.length > 0) {
        // Filter out questions that violate integration policy
        parsed.missing = filterIntegrationPolicyQuestions(parsed.missing, connectedApps);
        
        // Validate email fields in provided data
        for (const [key, value] of Object.entries(parsed.provided)) {
          if (typeof value === 'string' && (key.includes('email') || key.includes('@'))) {
            const validation = validateEmail(value);
            if (!validation.valid) {
              // Move invalid email to missing
              parsed.missing.push({
                key,
                question: `Please provide a valid email address for ${key}`,
                type: 'email',
                required: true,
              });
              delete parsed.provided[key];
            }
          }
        }
      }

      console.log('[extractGoal] LLM returned:', JSON.stringify(parsed, null, 2));
      console.log('[extractGoal] missing fields:', parsed.missing);

      return {
        scratch: {
          ...s.scratch,
          goal: parsed,
        },
      };
    } catch (e) {
      console.warn('[agent.extractGoal] Failed to extract goal; using fallback', {
        runId: s.ctx?.runId,
        error: e instanceof Error ? e.message : String(e),
      });

      // Fallback: treat as general assistance request
      return {
        scratch: {
          ...s.scratch,
          goal: {
            outcome: userPrompt.slice(0, 100),
            confidence: 0.5,
            provided: { prompt: userPrompt },
            missing: [],
          },
        },
      };
    }
  };
};
