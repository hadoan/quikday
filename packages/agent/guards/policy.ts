// packages/graph/guards/policy.ts
import type { Router } from '../runtime/graph';
import type { RunState, PlanStep } from '../state/types';
import { z } from 'zod';

/** ─────────────────────────────────────────────────────────────────────────────
 * Policy model (loaded per team from DB/cache); keep it narrow and JSON-safe.
 * ──────────────────────────────────────────────────────────────────────────── */
export const PolicySchema = z
  .object({
    teamId: z.string(),
    allowlist: z
      .object({
        tools: z.array(z.string()).default([]), // e.g., ["calendar.createEvent","slack.postMessage"]
        scopes: z.array(z.string()).default([]), // e.g., ["calendar:write","slack:write"]
      })
      .default({ tools: [], scopes: [] }),
    riskRules: z
      .object({
        defaultMode: z.enum(['PLAN', 'AUTO']).default('PLAN'),
        minConfidenceAuto: z.number().min(0).max(1).default(0.6),
        requireApprovalForHighRisk: z.boolean().default(true),
      })
      .default({ defaultMode: 'PLAN', minConfidenceAuto: 0.6, requireApprovalForHighRisk: true }),
    quietHours: z
      .object({
        enabled: z.boolean().default(false),
        // 0-6 = Sun..Sat; 24h local time in team TZ (use ctx.tz)
        windows: z
          .array(z.object({ dow: z.number().min(0).max(6), from: z.string(), to: z.string() }))
          .default([]),
        behavior: z.enum(['FORCE_PLAN', 'DEFER', 'BLOCK']).default('FORCE_PLAN'),
      })
      .default({ enabled: false, windows: [], behavior: 'FORCE_PLAN' }),
    budgets: z
      .object({
        enabled: z.boolean().default(false),
        limitCents: z.number().int().nonnegative().default(0),
      })
      .default({ enabled: false, limitCents: 0 }),
    residency: z
      .object({
        region: z.enum(['eu', 'us', 'other']).default('eu'),
        restrictCrossRegion: z.boolean().default(false),
      })
      .default({ region: 'eu', restrictCrossRegion: false }),
    reviewerRules: z
      .object({
        minApprovers: z.number().int().min(0).default(0),
        toolOverrides: z.record(z.string(), z.number().int().min(0)).default({}), // tool -> minApprovers
      })
      .default({ minApprovers: 0, toolOverrides: {} }),
  })
  .strict();

export type TeamPolicy = z.infer<typeof PolicySchema>;

/** Plug in your own lookup (cache/DB). */
export async function getTeamPolicy(teamId?: string): Promise<TeamPolicy> {
  // TODO: replace with Prisma/Redis call
  const base: TeamPolicy = {
    teamId: teamId ?? 'unknown',
    allowlist: { tools: [], scopes: [] },
    riskRules: { defaultMode: 'PLAN', minConfidenceAuto: 0.6, requireApprovalForHighRisk: true },
    quietHours: { enabled: false, windows: [], behavior: 'FORCE_PLAN' },
    budgets: { enabled: false, limitCents: 0 },
    residency: { region: 'eu', restrictCrossRegion: false },
    reviewerRules: { minApprovers: 0, toolOverrides: {} },
  };
  return base;
}

/** ─────────────────────────────────────────────────────────────────────────────
 * Router: decides where to go after classify.
 * Returns a node id string ("planner", "fallback_*") or "END".
 * ──────────────────────────────────────────────────────────────────────────── */
export const routeByMode: Router<RunState> = (s) => {
  // Fast path: malformed state
  if (!s || !s.ctx) return 'fallback_policy';

  const confidence = s.scratch?.intentMeta?.confidence ?? 1;
  const mode = s.mode; // "PLAN" | "AUTO"

  // Policy fetch can be async; if you prefer, preload it and attach in ctx.meta.
  // For synchronous router, assume it was preloaded into ctx.meta?.policy
  const policy: TeamPolicy | undefined = (s.ctx as any).meta?.policy;

  // Residency hard block (e.g., tool requires US but team is EU with restrictCrossRegion)
  if (policy && residencyBlocked(s, policy)) {
    s.scratch = {
      ...s.scratch,
      fallbackReason: 'residency_blocked',
      fallbackDetails: { policy },
    };
    return 'fallback';
  }

  // Hard policy deny if we already know tools are disallowed (e.g., from intent->tool map)
  const prelimTools = prelimRequiredToolsFromIntent(s);
  if (policy && prelimTools.length && !areToolsAllowed(prelimTools, policy)) {
    s.scratch = {
      ...s.scratch,
      fallbackReason: 'policy_denied',
      fallbackDetails: { tools: prelimTools },
    };
    return 'fallback';
  }

  // Quiet hours / budgets never hard-block here (unless policy says BLOCK);
  // we keep UX consistent by sending users to planner → confirm (which halts/asks).
  if (policy) {
    if (policy.quietHours.enabled && inQuietHours(s, policy)) {
      if (policy.quietHours.behavior === 'BLOCK') {
        s.scratch = {
          ...s.scratch,
          fallbackReason: 'quiet_hours',
          fallbackDetails: { quietHours: policy.quietHours },
        };
        return 'fallback';
      }
      // FORCE_PLAN/DEFER: continue to planner; confirm node will halt with a request.
    }
    if (policy.budgets.enabled && exceedsBudget(s, policy)) {
      s.scratch = {
        ...s.scratch,
        fallbackReason: 'budget_exceeded',
        fallbackDetails: { budgets: policy.budgets },
      };
      return 'fallback';
    }
  }

  // Confidence & mode: low confidence always PLAN; otherwise honor requested mode
  if (mode === 'PLAN' || confidence < (policy?.riskRules.minConfidenceAuto ?? 0.6)) {
    return 'planner'; // confirm gate will ask for approval/info
  }

  // AUTO: still go through planner (then confirm may no-op if safe)
  return 'planner';
};

/** ─────────────────────────────────────────────────────────────────────────────
 * Approval decision used by confirm node.
 * ──────────────────────────────────────────────────────────────────────────── */
export function needsApproval(s: RunState, policy?: TeamPolicy): boolean {
  const p = policy ?? (s.ctx as any).meta?.policy;
  const steps = s.scratch?.plan ?? [];

  const highRisk = steps.some((st) => st.risk === 'high');
  const minApprovers = Math.max(
    p?.reviewerRules.minApprovers ?? 0,
    ...steps.map((st) => p?.reviewerRules.toolOverrides[st.tool] ?? 0),
  );

  if (!p) return highRisk; // default conservative

  // Require approval for high risk?
  if (p.riskRules.requireApprovalForHighRisk && highRisk) return true;

  // If policy mandates approvers for any step/tool:
  return (minApprovers ?? 0) > 0;
}

/** Throw if the run token doesn’t include required scopes. */
export function requireScopes(have: string[], need: string[]) {
  const miss = need.filter((s) => !have.includes(s));
  if (miss.length) {
    const e = new Error(`Missing scopes: ${miss.join(', ')}`);
    (e as any).code = 'SCOPES_MISSING';
    throw e;
  }
}

/** Is a set of tools allowed by policy allowlist? */
export function areToolsAllowed(tools: string[], policy: TeamPolicy): boolean {
  if (!policy.allowlist.tools.length) return true; // empty allowlist means all allowed
  return tools.every((t) => policy.allowlist.tools.includes(t));
}

/** Residency hard block example: adjust to your connectors’ regions. */
export function residencyBlocked(s: RunState, policy: TeamPolicy): boolean {
  const requiredRegion: 'eu' | 'us' | 'other' | undefined = (s.ctx as any).meta?.requiredRegion;
  if (!requiredRegion) return false;
  if (!policy.residency.restrictCrossRegion) return false;
  return requiredRegion !== policy.residency.region;
}

/** Budget check (use your real ledger). */
export function exceedsBudget(s: RunState, policy: TeamPolicy): boolean {
  if (!policy.budgets.enabled) return false;
  const est = (s.scratch?.plan ?? []).reduce((c, st) => c + (st.costEstimateCents ?? 0), 0);
  const used = (s.ctx as any).meta?.budgetUsedCents ?? 0;
  return used + est > policy.budgets.limitCents;
}

/** Quiet hours check against local team timezone (ctx.tz). */
export function inQuietHours(s: RunState, policy: TeamPolicy): boolean {
  if (!policy.quietHours.enabled) return false;
  const tz = s.ctx.tz || 'Europe/Berlin';
  // Convert now to local DOW and HH:mm
  const now = new Date(s.ctx.now);
  const dow = now.getUTCDay(); // simplistic; replace with luxon if needed
  const hm = toLocalHM(now, tz); // "HH:mm"
  return policy.quietHours.windows.some((w) => w.dow === dow && withinRange(hm, w.from, w.to));
}

function withinRange(hm: string, from: string, to: string) {
  return from <= hm && hm < to;
}

// Stub: convert UTC -> local "HH:mm". Replace with timezone lib for accuracy.
function toLocalHM(d: Date, _tz: string): string {
  const hh = d.getHours().toString().padStart(2, '0');
  const mm = d.getMinutes().toString().padStart(2, '0');
  return `${hh}:${mm}`;
}

/** Pre-plan heuristic: infer which tools will likely be used from intent (optional). */
export function prelimRequiredToolsFromIntent(s: RunState): string[] {
  switch (s.scratch?.intent) {
    case 'calendar.schedule':
      return ['calendar.createEvent'];
    case 'slack.notify':
      return ['slack.postMessage'];
    case 'email.reply':
      return ['gmail.send'];
    case 'notion.create':
      return ['notion.createPage'];
    default:
      return [];
  }
}

/** If you want to gate by scopes at route time (optional). */
export function hasRequiredScopes(
  ctxScopes: string[],
  steps: PlanStep[],
  policy?: TeamPolicy,
): boolean {
  const need = new Set<string>();
  for (const st of steps) {
    const toolScopes = toolToScopes(st.tool, policy); // map your tools to scopes
    toolScopes.forEach((s) => need.add(s));
  }
  return Array.from(need).every((s) => ctxScopes.includes(s));
}

// Map tool → scopes (centralize in your ToolRegistry if you prefer)
function toolToScopes(tool: string, _policy?: TeamPolicy): string[] {
  if (tool.startsWith('calendar.')) return ['calendar:write'];
  if (tool.startsWith('slack.')) return ['slack:write'];
  if (tool.startsWith('gmail.')) return ['gmail:send'];
  return [];
}
