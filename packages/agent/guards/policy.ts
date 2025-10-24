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
 * Tool metadata: categories, scopes, always-allow set
 * ──────────────────────────────────────────────────────────────────────────── */

// Known tool ids used across planner/executor
export type ToolId =
  | 'calendar.checkAvailability'
  | 'calendar.createEvent'
  | 'slack.postMessage'
  | 'email.read'
  | 'email.send'
  | 'notion.upsert'
  | 'sheets.read'
  | 'sheets.write'
  | 'github.create_issue'
  | 'jira.create_issue'
  | 'chat.respond';

// Category helps risk & policy reasoning
export const TOOL_CATEGORY: Record<ToolId, 'safe' | 'read' | 'write' | 'messaging'> = {
  'calendar.checkAvailability': 'read',
  'calendar.createEvent': 'write',
  'slack.postMessage': 'messaging',
  'email.read': 'read',
  'email.send': 'messaging',
  'notion.upsert': 'write',
  'sheets.read': 'read',
  'sheets.write': 'write',
  'github.create_issue': 'write',
  'jira.create_issue': 'write',
  'chat.respond': 'safe', // ⬅️ Local LLM reply; no external side effects
};

// Scopes required per tool (adjust to your connectors)
export function toolToScopes(tool: string): string[] {
  if (tool === 'chat.respond') return []; // ⬅️ no external scopes
  if (tool.startsWith('calendar.')) return ['calendar:write']; // checkAvailability can be tolerated under write umbrella or split if needed
  if (tool.startsWith('slack.')) return ['slack:write'];
  if (tool.startsWith('email.')) return ['email:send']; // matches email.send
  if (tool.startsWith('notion.')) return ['notion:write'];
  if (tool.startsWith('sheets.read')) return ['sheets:read'];
  if (tool.startsWith('sheets.write')) return ['sheets:write'];
  if (tool.startsWith('github.')) return ['github:write'];
  if (tool.startsWith('jira.')) return ['jira:write'];
  return [];
}

// Tools that are always permitted regardless of allowlist/scopes
const SAFE_ALWAYS = new Set<ToolId>(['chat.respond']);

/** Central guard used by executor & router to enforce policy per tool. */
export function isToolAllowedByPolicy(
  tool: string,
  policy?: TeamPolicy,
  runAllowlist?: string[],
): boolean {
  // Always allow local, side-effect-free chat
  if (SAFE_ALWAYS.has(tool as ToolId)) return true;

  // If there is a per-run allowlist, respect it
  if (Array.isArray(runAllowlist) && runAllowlist.length > 0) {
    if (!runAllowlist.includes(tool)) return false;
  }

  // If team allowlist is empty => allow all (except future explicit denies)
  if (!policy || !policy.allowlist.tools.length) return true;

  return policy.allowlist.tools.includes(tool);
}

/** Is a set of tools allowed by policy allowlist? (kept for router’s pre-check) */
export function areToolsAllowed(tools: string[], policy: TeamPolicy): boolean {
  // If all tools in the set are SAFE_ALWAYS, allow quickly
  const onlySafe = tools.every((t) => SAFE_ALWAYS.has(t as ToolId));
  if (onlySafe) return true;

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
    case 'email.send':
    case 'email.reply':
      return ['email.send'];
    case 'notion.create':
    case 'notion.upsert':
      return ['notion.upsert'];
    case 'sheets.write':
      return ['sheets.write'];
    case 'sheets.read':
      return ['sheets.read'];
    case 'github.create_issue':
      return ['github.create_issue'];
    case 'jira.create_issue':
      return ['jira.create_issue'];
    case 'chat.respond':
      return []; // ⬅️ no external tools/scopes; never block
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
    toolToScopes(st.tool).forEach((s) => need.add(s));
  }

  // If team policy specifies an allowlist of scopes, ensure we don't exceed it
  const policyScopes = policy?.allowlist.scopes ?? [];
  if (policyScopes.length) {
    for (const sc of need) if (!policyScopes.includes(sc)) return false;
  }

  return Array.from(need).every((s) => ctxScopes.includes(s));
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

  // Residency hard block
  if (policy && residencyBlocked(s, policy)) {
    s.scratch = {
      ...s.scratch,
      fallbackReason: 'residency_blocked',
      fallbackDetails: { policy },
    };
    return 'fallback';
  }

  // Hard policy deny only for external tools (skip safe chat)
  const prelimTools = prelimRequiredToolsFromIntent(s).filter(
    (t) => !SAFE_ALWAYS.has(t as ToolId),
  );
  if (policy && prelimTools.length && !areToolsAllowed(prelimTools, policy)) {
    s.scratch = {
      ...s.scratch,
      fallbackReason: 'policy_denied',
      fallbackDetails: { tools: prelimTools },
    };
    return 'fallback';
  }

  // Quiet hours / budgets may BLOCK depending on policy
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
      // FORCE_PLAN/DEFER: continue to planner; confirm node will halt/ask.
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
    return 'planner';
  }

  // AUTO: still go through planner (confirm may no-op if safe)
  return 'planner';
};

/** Approval decision used by confirm node. */
export function needsApproval(s: RunState, policy?: TeamPolicy): boolean {
  const p = policy ?? (s.ctx as any).meta?.policy;
  const steps = s.scratch?.plan ?? [];

  const highRisk = steps.some((st) => st.risk === 'high' && st.tool !== 'chat.respond');
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
