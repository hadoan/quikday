// packages/agent/nodes/planner.ts
import type { Node } from '../runtime/graph.js';
import type { RunState, PlanStep } from '../state/types.js';
import { events } from '../observability/events.js';
import { z } from 'zod';
import type { RunEventBus } from '@quikday/libs';
import { registry } from '../registry/registry.js';
import type { LLM } from '../llm/types.js';
import { buildPlannerSystemPrompt } from '../prompts/PLANNER_SYSTEM.js';
import { DEFAULT_ASSISTANT_SYSTEM } from '../prompts/DEFAULT_ASSISTANT_SYSTEM.js';

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
    meta: { todayISO, timezone },
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

  // 2) If schedule intent & times missing → enforce canonical sequence (optional)
  // const isSchedule = intent === INTENT.CALENDAR_SCHEDULE;
  // const missing = new Set(required_inputs.filter((k) => !(k in valid_inputs)));

  // if (isSchedule) {
  //   if (missing.has('when.startISO') || missing.has('when.endISO')) {
  //     const keys = new Set(questions.map((q) => q.key));
  //     if (missing.has('when.startISO') && !keys.has('when.startISO')) {
  //       questions.push({
  //         key: 'when.startISO',
  //         question: 'What start time should I use for the meeting (ISO 8601)?',
  //         type: 'datetime',
  //         required: true,
  //         placeholder: '2025-10-24T10:00:00Z',
  //         format: 'iso8601',
  //         rationale: 'Required to check availability and create the event.',
  //       });
  //     }
  //     if (missing.has('when.endISO') && !keys.has('when.endISO')) {
  //       questions.push({
  //         key: 'when.endISO',
  //         question: 'What end time should I use for the meeting (ISO 8601)?',
  //         type: 'datetime',
  //         required: true,
  //         placeholder: '2025-10-24T10:30:00Z',
  //         format: 'iso8601',
  //       });
  //     }
  //     steps = [];
  //   } else {
  //     // Ensure canonical steps and normalize args
  //     const hasCreate = steps.some((s) => s.tool === 'calendar.createEvent');
  //     const hasCheck = steps.some((s) => s.tool === 'calendar.checkAvailability');

  //     if (hasCreate && !hasCheck) {
  //       steps.unshift({
  //         tool: 'calendar.checkAvailability',
  //         args: { start, end },
  //       });
  //     }
  //     if (!hasCreate) {
  //       steps.push({
  //         tool: 'calendar.createEvent',
  //         args: {
  //           title,
  //           start,
  //           end,
  //           notifyAttendees: true,
  //           location: 'Google Meet',
  //         },
  //       });
  //     }
  //     const hasSlack = steps.some((s) => s.tool === 'slack.postMessage');
  //     if (slackChannel && !hasSlack) {
  //       steps.push({
  //         tool: 'slack.postMessage',
  //         args: {
  //           channel: slackChannel,
  //           text: `Scheduled: *${title}* from ${start} to ${end}. Invites sent. (<event_link>)`,
  //         },
  //       });
  //     }

  //     for (const st of steps) {
  //       if (st.tool === 'calendar.checkAvailability') {
  //         st.args = { start, end, ...(st.args ?? {}) };
  //       }
  //       if (st.tool === 'calendar.createEvent') {
  //         st.args = {
  //           title,
  //           start,
  //           end,
  //           notifyAttendees: true,
  //           location: 'Google Meet',
  //           ...(st.args ?? {}),
  //         };
  //       }
  //     }
  //   }

  // }

  return { steps: finalizeSteps(steps as any) };
}

/* ------------------ Preview Steps Generator ------------------ */

/**
 * Generate human-readable preview of what will happen once we have missing info
 */
function generatePreviewSteps(goal: any, missing: any[]): string[] {
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
    steps.push(`⏸️ Waiting for: ${missing.map((m: any) => m.key.replace(/_/g, ' ')).join(', ')}`);
  }
  
  return steps;
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

    // 2) Check if there are missing required fields
    const missing = goal.missing || [];
    const requiredMissing = missing.filter((m: any) => m.required !== false);
    
    if (requiredMissing.length > 0) {
      // Generate preview steps to show what we'll do once we have the info
      const previewSteps = generatePreviewSteps(goal, requiredMissing);
      
      // Return empty plan with preview - the confirm node will ask questions
      const diff = safe({
        summary: `Need ${requiredMissing.length} more detail${requiredMissing.length > 1 ? 's' : ''} to proceed`,
        steps: [],
        previewSteps,
        goalDesc: goal.outcome,
        missingFields: requiredMissing.map((m: any) => ({
          key: m.key,
          question: m.question,
          required: m.required !== false,
          type: m.type,
          options: m.options,
        })),
        status: 'awaiting_input',
      });
      events.planReady(s, eventBus, safe([]), diff);
      return { 
        scratch: { ...s.scratch, plan: [], previewSteps }, 
        output: { ...s.output, diff } 
      };
    }

    // 3) Try LLM planning with available tools
    const tools = getToolSchemas();
    const system = buildSystemPrompt(tools);
    const user = buildUserPrompt(s);
    const raw = await planWithLLM(llm, s, system, user);

    if (raw) {
      try {
        const cleaned = extractJsonFromOutput(raw);
        const parsed = PlanInSchema.parse(JSON.parse(cleaned));
        const hardened = patchAndHardenPlan(s, parsed);
        steps = hardened.steps;
      } catch (err) {
        console.warn('[planner] Failed to parse LLM plan:', err);
        steps = null; // fall back
      }
    }

    // 4) If no valid steps, fall back to chat.respond
    if (!steps || steps.length === 0) {
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

    // 5) Build diff
    const diff = safe({
      summary:
        steps && steps.length > 0
          ? `Proposed actions: ${steps.map((x) => x.tool.split('.').pop()).join(' → ')}`
          : 'No actions proposed.',
      steps: (steps ?? []).map(({ id, tool, dependsOn }) => ({ id, tool, dependsOn })),
      goalDesc: goal.outcome,
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
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence && fence[1]) s = fence[1].trim();
  const first = s.indexOf('{');
  const last = s.lastIndexOf('}');
  if (first >= 0 && last > first) s = s.slice(first, last + 1);
  return s;
}
