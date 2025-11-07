// packages/agent/nodes/planner.ts
import type { Node } from '../runtime/graph.js';
import type { RunState, PlanStep } from '../state/types.js';
import { normalizePlanToExplicitExpansion } from './executor/planNormalize.js';
import { events } from '../observability/events.js';
import { z } from 'zod';
import type { RunEventBus } from '@quikday/libs';
import { registry } from '../registry/registry.js';
import type { LLM } from '../llm/types.js';
import { buildPlannerSystemPrompt } from '../prompts/PLANNER_SYSTEM.js';
import { DEFAULT_ASSISTANT_SYSTEM } from '../prompts/DEFAULT_ASSISTANT_SYSTEM.js';
import { MISSING_INPUTS_SYSTEM } from '../prompts/MISSING_INPUTS_SYSTEM.js';
import { buildMissingInputsUserPrompt, type ToolRequirement } from '../prompts/MISSING_INPUTS_USER_PROMPT.js';

/* ------------------ Whitelist & Schemas ------------------ */

function getToolWhitelist(): string[] {
  try {
    const names = registry.names();
    // Optionally filter internal tools if needed
    return names.filter((n) => n && typeof n === 'string');
  } catch {
    // Fallback minimal set if registry not ready
    return ['chat.respond'];
  }
}

function getToolSchemas(): Array<{ name: string; description: string; args: any }> {
  try {
    return registry.getSchemas();
  } catch {
    return [{ name: 'chat.respond', description: 'Generate a response', args: {} }];
  }
}

type AllowedTool = string;

// Step schema the LLM returns
const StepInSchema = z.object({
  tool: z.string().refine((v) => getToolWhitelist().includes(v), { message: 'Tool not allowed' }),
  args: z.record(z.string(), z.any()).default({}),
  // Optional map/vars extensions
  expandOn: z.string().optional(),
  expandKey: z.string().optional(),
  binds: z.record(z.string(), z.string()).optional(),
});

// Planner LLM returns only steps
const PlanInSchema = z.object({
  steps: z.array(StepInSchema).min(0),
});

/* ------------------ Small Helpers ------------------ */

const safe = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const sid = (n: number) => `step-${String(n).padStart(2, '0')}`;

/**
 * Validate and fix tool arguments using the actual tool schema.
 * If validation fails, attempt to parse the error and provide helpful feedback.
 */
function validateAndFixToolArgs(toolName: string, args: any): { valid: boolean; args: any; error?: string } {
  try {
    const tool = registry.get(toolName);
    if (!tool?.in) {
      // No schema validation available, accept as-is
      return { valid: true, args };
    }

    // Try to parse with the tool's schema
    const result = tool.in.safeParse(args);
    
    if (result.success) {
      // Valid! Return the parsed/coerced args
      return { valid: true, args: result.data };
    }

    // Validation failed - extract error details
    const zodError = result.error;
    const formatted = zodError.format();
    
    // Build a helpful error message
    const fieldErrors: string[] = [];
    for (const [field, err] of Object.entries(formatted)) {
      if (field !== '_errors' && err && typeof err === 'object' && '_errors' in err) {
        const messages = (err as any)._errors;
        if (Array.isArray(messages) && messages.length > 0) {
          fieldErrors.push(`  - ${field}: ${messages.join(', ')}`);
        }
      }
    }
    
    const errorMsg = fieldErrors.length > 0 
      ? `Invalid arguments for ${toolName}:\n${fieldErrors.join('\n')}`
      : `Invalid arguments for ${toolName}`;

    return { valid: false, args, error: errorMsg };
  } catch (err) {
    // Registry error or unexpected issue
    return { valid: false, args, error: `Could not validate ${toolName}: ${err}` };
  }
}

const isEmail = (v?: string) =>
  typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());


/** 
 * Wire ids & naïve linear dependsOn; assign risk from tool registry.
 * 
 * Risk Level Assignment:
 * - Reads the `risk` property from the tool definition in the registry
 * - Falls back to 'low' if tool not found or risk not defined
 * - This ensures the plan accurately reflects the tool's actual risk level
 */
function finalizeSteps(steps: Omit<PlanStep, 'id' | 'risk' | 'dependsOn'>[]): PlanStep[] {
  return steps.map((st, i) => {
    const id = sid(i + 1);
    const dependsOn = i === 0 ? [] : [sid(i)];
    
    // Get risk level from tool registry instead of hardcoding
    let risk: 'low' | 'high' = 'low'; // default
    try {
      const tool = registry.get(st.tool);
      if (tool?.risk) {
        risk = tool.risk;
      }
    } catch (err) {
      console.warn(`[planner] Could not get risk for tool ${st.tool}:`, err);
    }
    
    return { id, dependsOn, risk, ...st };
  });
}

/* ------------------ LLM glue ------------------ */
async function planWithLLM(
  llm: LLM,
  s: RunState,
  system: string,
  user: string,
): Promise<string | null> {
  try {
    return await llm.text({
      system,
      user,
      temperature: 0,
      maxTokens: 1000, // Increased to allow for detailed schemas
      timeoutMs: 15_000,
      metadata: {
        requestType: 'planner',
        apiEndpoint: 'planner.plan',
        runId: s.ctx.runId as any,
        userId: s.ctx.userId as any,
        teamId: (s.ctx.teamId as any) ?? undefined,
        // Use a stronger model for planning by default; allow env override
        model: process.env.OPENAI_PLANNER_MODEL || 'gpt-4o',
      },
    });
  } catch {
    return null;
  }
}

/* ------------------ Prompts (include goal + today/tz) ------------------ */

function buildSystemPrompt(tools: Array<{ name: string; description: string; args: any }>) {
  return buildPlannerSystemPrompt(tools);
}

function buildUserPrompt(s: RunState) {
  const todayISO = (s.ctx.now instanceof Date ? s.ctx.now : new Date()).toISOString();
  const timezone = s.ctx.tz || 'UTC';
  const meta: any = (s.ctx as any)?.meta || {};
  const userName = (meta.userName as string | undefined) || undefined;
  const userEmail = (meta.userEmail as string | undefined) || undefined;

  // Extract goal information
  const goal = s.scratch?.goal || {};
  const outcome = (goal as any).outcome || 'Unspecified goal';
  const context = (goal as any).context || {};
  const provided = (goal as any).provided || {};

  // Compact, LLM-friendly user payload
  const payload = {
    goal: {
      outcome,
      context,
      provided,
    },
    meta: {
      todayISO,
      timezone,
      user: {
        id: s.ctx.userId,
        ...(userName ? { name: userName } : {}),
        ...(userEmail ? { email: userEmail } : {}),
      },
    },
  };
  return JSON.stringify(payload, null, 2);
}

/* ------------------ Post-processing (patch/harden) ------------------ */

function patchAndHardenPlan(
  s: RunState,
  drafted: z.infer<typeof PlanInSchema>,
): {
  steps: PlanStep[];
} {
  // const { start, end } = resolveWhen(s);
  // const title = getTitle(s);
  // const slackChannel = getSlackChannel(s);

  // 1) Filter to allowed tools (defensive)
  const whitelist = new Set(getToolWhitelist());
  let steps = (drafted.steps ?? []).filter((st) => whitelist.has(st.tool as AllowedTool));

  // 2) Validate and fix arguments for each step using Zod schemas
  const validatedSteps: typeof steps = [];
  const invalidSteps: Array<{ tool: string; error: string }> = [];

  for (const step of steps) {
    const validation = validateAndFixToolArgs(step.tool, step.args);
    
    if (validation.valid) {
      // Use the validated/coerced arguments from Zod
      validatedSteps.push({
        ...step,
        args: validation.args,
      });
    } else {
      // Log invalid step for debugging
      console.warn(`[Planner] Invalid arguments for ${step.tool}:`, validation.error);
      invalidSteps.push({
        tool: step.tool,
        error: validation.error || 'Unknown validation error',
      });
    }
  }

  // Log validation summary if any steps were invalid
  if (invalidSteps.length > 0) {
    console.warn(
      `[Planner] Filtered out ${invalidSteps.length} invalid step(s):`,
      invalidSteps.map(s => `${s.tool}: ${s.error}`).join('; ')
    );
  }

  // Use validated steps
  steps = validatedSteps;

  // Assign ids/dependsOn/risk
  const finalized = finalizeSteps(steps as any);
  const normalized = normalizePlanToExplicitExpansion(finalized);
  return { steps: normalized };
}

/* ------------------ Preview Steps Generator ------------------ */

/**
 * Generate human-readable preview of what will happen once we have missing info
 */
type MissingField = { key: string; question: string; type?: string; required?: boolean; options?: string[] };
type SimpleGoal = { outcome?: string; provided?: Record<string, unknown> };

function generatePreviewSteps(goal: SimpleGoal, missing: MissingField[]): string[] {
  const outcome = (goal?.outcome || '').toLowerCase();
  const steps: string[] = [];
  
  // Email triage patterns
  if (outcome.includes('triage') && outcome.includes('email')) {
    const timeWindow = goal?.provided?.time_window_minutes || 'specified';
    const maxResults = goal?.provided?.max_results || 'N';
    steps.push(`1. Search your inbox for emails from the last ${timeWindow} minutes`);
    steps.push(`2. Filter and rank emails based on priority criteria`);
    steps.push(`3. Select up to ${maxResults} emails that need replies`);
  }
  
  // Draft creation patterns
  if (outcome.includes('draft') || outcome.includes('reply') || outcome.includes('quick-reply')) {
    steps.push(`${steps.length + 1}. Generate context-appropriate reply drafts`);
    steps.push(`${steps.length + 1}. Present drafts for your review`);
  }
  
  // Follow-up patterns
  if (outcome.includes('follow-up') || outcome.includes('no-reply')) {
    const days = goal?.provided?.days || goal?.provided?.time_window_days || 'specified';
    steps.push(`1. Search for email threads with no replies from the last ${days} days`);
    steps.push(`2. Generate polite follow-up drafts for each thread`);
    steps.push(`3. Present drafts for your review`);
  }
  
  // Calendar patterns
  if (outcome.includes('schedule') || outcome.includes('meeting') || outcome.includes('call')) {
    steps.push(`1. Check calendar availability for requested time`);
    steps.push(`2. Create calendar event with attendees`);
    if (outcome.includes('notify') || outcome.includes('send')) {
      steps.push(`3. Send calendar invitations to attendees`);
    }
  }
  
  // Posting patterns
  if (outcome.includes('post') || outcome.includes('publish')) {
    const platform = goal?.provided?.platform || 'the platform';
    steps.push(`1. Format content for ${platform}`);
    steps.push(`2. Post to ${platform}`);
  }
  
  // Generic fallback
  if (steps.length === 0) {
    steps.push(`1. Process your request: ${goal?.outcome || 'complete the task'}`);
    steps.push(`2. Present results for your review`);
  }
  
  // Add missing info indicator
  if (missing.length > 0) {
    steps.push('');
    steps.push(`⏸️ Waiting for: ${missing.map((m) => m.key.replace(/_/g, ' ')).join(', ')}`);
  }
  
  return steps;
}

/* ------------------ Missing Inputs Detection ------------------ */

/**
 * Use LLM to intelligently identify missing inputs based on tool schemas and user message.
 * This provides contextual understanding of what information is truly missing.
 */
async function detectMissingInputsWithLLM(
  llm: LLM,
  steps: PlanStep[],
  userMessage: string,
  provided: Record<string, unknown>,
  answers: Record<string, unknown>,
  s: RunState
): Promise<Array<{ key: string; question: string; type?: string; required?: boolean; options?: string[] }>> {
  if (steps.length === 0) return [];

  const allProvided = { ...provided, ...answers };
  
  // Build a summary of tool requirements
  const toolRequirements: ToolRequirement[] = [];

  for (const step of steps) {
    try {
      const tool = registry.get(step.tool);
      if (!tool?.in) {
        console.log(`[detectMissingInputsWithLLM] Tool ${step.tool} has no schema, skipping`);
        continue;
      }

      // Extract schema information (support different Zod versions and wrappers)
      const schema = tool.in as any;
      const getShape = (sch: any): Record<string, unknown> => {
        try {
          let cur = sch;
          let guard = 0;
          while (cur && guard++ < 5) {
            const typeName = cur?._def?.typeName;
            if (typeName === 'ZodObject') {
              const maybe = cur?._def?.shape ?? cur?.shape;
              if (typeof maybe === 'function') return maybe();
              if (maybe && typeof maybe === 'object') return maybe as Record<string, unknown>;
              return {};
            }
            // unwrap common wrappers (Optional/Nullable/Default/Effects)
            if (cur?._def?.schema) {
              cur = cur._def.schema;
              continue;
            }
            if (cur?._def?.innerType) {
              cur = cur._def.innerType;
              continue;
            }
            if (typeof cur.unwrap === 'function') {
              cur = cur.unwrap();
              continue;
            }
            break;
          }
        } catch {
          // fall through
        }
        // Last resort: attempt legacy access
        const maybeLegacy = sch?._def?.shape ?? sch?.shape;
        if (typeof maybeLegacy === 'function') {
          try { return maybeLegacy(); } catch { return {}; }
        }
        return (maybeLegacy && typeof maybeLegacy === 'object') ? (maybeLegacy as Record<string, unknown>) : {};
      };

      const shape = getShape(schema);
      
      console.log(`[detectMissingInputsWithLLM] Extracted shape for ${step.tool}:`, {
        shapeKeys: Object.keys(shape),
        currentArgs: step.args,
      });
      
      const requiredParams: Array<{ name: string; type: string; description?: string; required: boolean }> = [];
      
      for (const [key, value] of Object.entries(shape)) {
        if (!value || typeof value !== 'object') continue;
        
        const zodType = (value as any)._def?.typeName || 'unknown';
        const isOptional = (value as any).isOptional?.() || (value as any)._def?.typeName === 'ZodOptional';
        const description = (value as any)._def?.description || (value as any).description;
        
        // Map Zod types to readable types
        let type = 'text';
        if (zodType.includes('String')) type = 'text';
        else if (zodType.includes('Number')) type = 'number';
        else if (zodType.includes('Boolean')) type = 'boolean';
        else if (zodType.includes('Date')) type = 'datetime';
        else if (zodType.includes('Array')) type = 'array';
        
        // Check if this field name suggests a specific type
        const keyLower = key.toLowerCase();
        if (keyLower.includes('email')) type = 'email';
        else if (keyLower.includes('date') || keyLower.includes('time') || keyLower.includes('when')) type = 'datetime';
        else if (keyLower.includes('channel') || keyLower.includes('room')) type = 'text';
        
        requiredParams.push({
          name: key,
          type,
          description,
          required: !isOptional,
        });
      }
      
      console.log(`[detectMissingInputsWithLLM] Required params for ${step.tool}:`, {
        count: requiredParams.length,
        params: requiredParams,
      });
      
      toolRequirements.push({
        tool: step.tool,
        requiredParams,
        currentArgs: step.args || {},
      });
    } catch (err) {
      console.warn(`[planner] Could not extract schema for tool ${step.tool}:`, err);
    }
  }

  if (toolRequirements.length === 0) {
    console.log('[detectMissingInputsWithLLM] No tool requirements found, returning empty array');
    return [];
  }

  // Build prompts using the centralized prompt system
  const userPrompt = buildMissingInputsUserPrompt(userMessage, allProvided, toolRequirements);
  
  console.log('[detectMissingInputsWithLLM] Prepared prompt for LLM:', {
    toolRequirementsCount: toolRequirements.length,
    toolNames: toolRequirements.map(t => t.tool),
    allProvidedKeys: Object.keys(allProvided),
    userMessagePreview: userMessage.slice(0, 100),
  });

  try {
    const raw = await llm.text({
      system: MISSING_INPUTS_SYSTEM,
      user: userPrompt,
      temperature: 0,
      maxTokens: 1000,
      timeoutMs: 10_000,
      metadata: {
        requestType: 'missing-inputs-detection',
        runId: s.ctx.runId as any,
        userId: s.ctx.userId as any,
      },
    });

    // Extract JSON from response
    const cleaned = extractJsonFromOutput(raw);
    
    console.log('[detectMissingInputsWithLLM] Raw LLM response:', {
      rawLength: raw.length,
      rawPreview: raw.slice(0, 200),
      cleanedLength: cleaned.length,
      cleanedPreview: cleaned.slice(0, 200),
    });
    
    const parsed = JSON.parse(cleaned);
    
    console.log('[detectMissingInputsWithLLM] Parsed JSON:', {
      isArray: Array.isArray(parsed),
      type: typeof parsed,
      length: Array.isArray(parsed) ? parsed.length : 'N/A',
      parsed: parsed,
    });
    
    if (!Array.isArray(parsed)) {
      console.warn('[planner] LLM did not return an array for missing inputs');
      return [];
    }

    // Validate and clean the response
    const missingInputs = parsed
      .filter((item: any) => item && typeof item === 'object' && item.key && item.question)
      .map((item: any) => ({
        key: String(item.key),
        question: String(item.question),
        type: item.type || 'text',
        required: item.required !== false,
        options: Array.isArray(item.options) ? item.options : undefined,
      }));

    console.log('[detectMissingInputsWithLLM] Final missing inputs after validation:', {
      count: missingInputs.length,
      missingInputs,
    });
    
    return missingInputs;
    
  } catch (err) {
    console.warn('[planner] Failed to use LLM for missing input detection:', err);
    // Fallback to simple validation check
    return fallbackMissingInputsDetection(steps, allProvided);
  }
}

/**
 * Fallback: Simple check for missing required params using Zod validation
 * Used if LLM-based detection fails
 */
function fallbackMissingInputsDetection(
  steps: PlanStep[],
  allProvided: Record<string, unknown>
): Array<{ key: string; question: string; type?: string; required?: boolean }> {
  const missingInputs: Array<{ key: string; question: string; type?: string; required?: boolean }> = [];

  for (const step of steps) {
    try {
      const tool = registry.get(step.tool);
      if (!tool?.in) continue;

      const result = tool.in.safeParse(step.args);
      
      if (!result.success) {
        const zodError = result.error;
        const issues = zodError.issues;

        for (const issue of issues) {
          const fieldPath = issue.path.join('.');
          const fieldName = String(issue.path[issue.path.length - 1] || 'unknown');
          
          if (allProvided[fieldPath] === undefined && allProvided[fieldName] === undefined) {
            const required = issue.code === 'invalid_type' || !issue.message.includes('optional');
            
            missingInputs.push({
              key: fieldPath || fieldName,
              question: `Please provide ${fieldName} for ${step.tool}`,
              type: 'text',
              required,
            });
          }
        }
      }
    } catch (err) {
      console.warn(`[planner] Fallback validation failed for tool ${step.tool}:`, err);
    }
  }

  return missingInputs;
}

/* ------------------ Planner Node ------------------ */

export const makePlanner =
  (llm: LLM): Node<RunState, RunEventBus> =>
  async (s, eventBus) => {
    const goal = (s.scratch as any)?.goal;
    const confidence = goal?.confidence ?? 0;
    const userText =
      s.input.prompt ??
      s.input.messages?.map((m) => (typeof m.content === 'string' ? m.content : '')).join('\n') ??
      '';

    let steps: PlanStep[] | null = null;

    // 1) If no goal or very low confidence → use chat.respond
    if (!goal || confidence < 0.5) {
      steps = finalizeSteps([
        {
          tool: 'chat.respond',
          args: {
            prompt: userText ?? '',
            system: DEFAULT_ASSISTANT_SYSTEM,
          },
        },
      ]);
      const diff = safe({
        summary: 'Answer with assistant (chat.respond).',
        steps: steps.map(({ id, tool, dependsOn }) => ({ id, tool, dependsOn })),
        goalDesc: goal?.outcome || 'No clear goal identified',
      });
      events.planReady(s, eventBus, safe(steps), diff);
      return { scratch: { ...s.scratch, plan: steps }, output: { ...s.output, diff } };
    }

    // 2) Try LLM planning with available tools
    const tools = getToolSchemas();
    const system = buildSystemPrompt(tools);
    const user = buildUserPrompt(s);
    
    console.log('[planner] Calling LLM for planning:', {
      goalOutcome: goal?.outcome,
      goalConfidence: confidence,
      toolsCount: tools.length,
      toolNames: tools.map(t => t.name),
      userPromptPreview: user.slice(0, 200),
    });
    
    const raw = await planWithLLM(llm, s, system, user);

    console.log('[planner] LLM raw response:', {
      hasResponse: !!raw,
      rawLength: raw?.length ?? 0,
      rawPreview: raw?.slice(0, 300),
    });

    if (raw) {
      try {
        const cleaned = extractJsonFromOutput(raw);
        console.log('[planner] Cleaned JSON:', {
          cleanedLength: cleaned.length,
          cleanedPreview: cleaned.slice(0, 300),
        });
        
        const parsed = PlanInSchema.parse(JSON.parse(cleaned));
        console.log('[planner] Parsed plan:', {
          stepsCount: parsed.steps.length,
          steps: parsed.steps,
        });
        
        const hardened = patchAndHardenPlan(s, parsed);
        console.log('[planner] Hardened plan:', {
          stepsCount: hardened.steps.length,
          tools: hardened.steps.map(s => s.tool),
        });
        
        steps = hardened.steps;
      } catch (err) {
        console.warn('[planner] Failed to parse LLM plan:', err);
        steps = null; // fall back
      }
    }

    // 3) If no valid steps, fall back to chat.respond
    if (!steps || steps.length === 0) {
      console.warn('[planner] No valid steps from planner, falling back to chat.respond');
      steps = finalizeSteps([
        {
          tool: 'chat.respond',
          args: {
            prompt: userText ?? '',
            system: DEFAULT_ASSISTANT_SYSTEM,
          },
        },
      ]);
    }

    // 4) Check for missing inputs using LLM-based intelligent detection
    const provided = (goal?.provided ?? {}) as Record<string, unknown>;
    const answers = (s.scratch?.answers ?? {}) as Record<string, unknown>;
    
    console.log('[planner] Starting missing inputs detection:', {
      provided,
      answers,
      stepsCount: steps.length,
      stepTools: steps.map(s => s.tool),
    });
    
    const missingFromToolSchemas = await detectMissingInputsWithLLM(
      llm,
      steps,
      userText,
      provided,
      answers,
      s
    );
    
    console.log('[planner] LLM detected missing inputs:', {
      count: missingFromToolSchemas.length,
      missing: missingFromToolSchemas,
    });
    
    // Collect all missing inputs from tool schema validation
    const allMissing = [...missingFromToolSchemas];
    
    // Filter to only required missing inputs
    const requiredMissing = allMissing.filter((m: any) => m.required !== false);
    
    console.log('[planner] Filtered missing inputs:', {
      allMissingCount: allMissing.length,
      requiredMissingCount: requiredMissing.length,
      requiredMissing,
    });
    
    // 5) If there are missing required inputs, pause and return
    if (requiredMissing.length > 0) {
      // Generate preview steps to show what we'll do once we have the info
      const previewSteps = generatePreviewSteps(goal, requiredMissing);
      
      // Return plan with preview and mark awaiting_input so the UI can
      // show the intended plan while also prompting for missing info.
      const diff = safe({
        summary: `Need ${requiredMissing.length} more detail${requiredMissing.length > 1 ? 's' : ''} to proceed`,
        steps: (steps ?? []).map(({ id, tool, dependsOn }) => ({ id, tool, dependsOn })),
        previewSteps,
        goalDesc: goal.outcome,
        missingFields: requiredMissing.map((m: MissingField) => ({
          key: m.key,
          question: m.question,
          required: m.required !== false,
          type: m.type,
          options: m.options,
        })),
        status: 'awaiting_input',
      });
      events.planReady(s, eventBus, safe(steps ?? []), diff);
      return {
        scratch: { ...s.scratch, plan: steps ?? [], previewSteps },
        output: { ...s.output, diff },
      };
    }

    // 6) Build diff for successful planning
    const missingFieldsFormatted = allMissing.length > 0 ? allMissing.map((m: MissingField) => ({
      key: m.key,
      question: m.question,
      required: m.required !== false,
      type: m.type,
      options: m.options,
    })) : undefined;
    
    console.log('[planner] Building successful diff:', {
      hasSteps: steps && steps.length > 0,
      stepsCount: steps?.length ?? 0,
      hasMissingFields: !!missingFieldsFormatted,
      missingFieldsCount: missingFieldsFormatted?.length ?? 0,
      missingFields: missingFieldsFormatted,
    });
    
    const diff = safe({
      summary:
        steps && steps.length > 0
          ? `Proposed actions: ${steps.map((x) => x.tool.split('.').pop()).join(' → ')}`
          : 'No actions proposed.',
      steps: (steps ?? []).map(({ id, tool, dependsOn }) => ({ id, tool, dependsOn })),
      goalDesc: goal.outcome,
      // Include ALL missing fields (both required and optional) for the client to handle
      missingFields: missingFieldsFormatted,
      status: 'ready',
    });

    events.planReady(s, eventBus, safe(steps ?? []), diff);

    return {
      scratch: {
        ...s.scratch,
        plan: steps ?? [],
      },
      output: { ...s.output, diff },
    };
  };

// Extract a JSON object if the model wrapped it in ```json fences or extra prose
function extractJsonFromOutput(output: string): string {
  let s = (output || '').trim();
  
  // Remove markdown code fences if present
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence && fence[1]) s = fence[1].trim();
  
  // Check if it's an array or object
  const firstBracket = s.indexOf('[');
  const firstBrace = s.indexOf('{');
  
  // Determine if we're dealing with an array or object
  const isArray = firstBracket >= 0 && (firstBrace < 0 || firstBracket < firstBrace);
  
  if (isArray) {
    // Extract array
    const last = s.lastIndexOf(']');
    if (firstBracket >= 0 && last > firstBracket) {
      return s.slice(firstBracket, last + 1);
    }
  } else {
    // Extract object
    const last = s.lastIndexOf('}');
    if (firstBrace >= 0 && last > firstBrace) {
      return s.slice(firstBrace, last + 1);
    }
  }
  
  return s;
}
