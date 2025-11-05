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
  repairJsonOutput 
} from '../guards/validators.js';

/**
 * Goal extraction node factory
 * Uses modular prompt system with domain-specific rules
 * 
 * This node extracts the user's goal, context, and provided values.
 * Missing input detection is handled later by the planner node using tool schemas.
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
    
    const meta = (s.ctx as any)?.meta || {};
    const user = compileGoalUserPrompt(userPrompt, answers, {
      timezone: tz,
      todayISO,
      user: {
        id: s.ctx.userId,
        name: (meta.userName as string | undefined) || undefined,
        email: (meta.userEmail as string | undefined) || undefined,
      },
    });

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
      const parsed = GoalSchema.parse(JSON.parse(json));

      console.log('[extractGoal] LLM returned:', JSON.stringify(parsed, null, 2));

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

      // Fallback: treat as general assistance request (no missing fields)
      return {
        scratch: {
          ...s.scratch,
          goal: {
            outcome: userPrompt.slice(0, 100),
            confidence: 0.5,
            provided: { prompt: userPrompt },
          },
        },
      };
    }
  };
};
