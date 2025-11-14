import { getTeamPolicy, type TeamPolicy } from '@quikday/agent/guards/policy';
import type { ChatMessage } from '@quikday/agent/state/types';
import { RunStatus } from '@prisma/client';

export type MessageLike =
  | (Partial<ChatMessage> & {
      role?: string;
      content?: string | null;
      ts?: string | Date | null;
      toolName?: string | null;
    })
  | null
  | undefined;

export function jsonClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

export function normalizeMessages(messages: MessageLike[] | undefined, prompt?: string): ChatMessage[] {
  const allowedRoles = new Set(['system', 'user', 'assistant', 'tool']);
  const normalized: ChatMessage[] = [];

  if (Array.isArray(messages)) {
    messages.forEach((msg) => {
      if (!msg || typeof msg.content !== 'string') return;
      const trimmed = msg.content.trim();
      if (!trimmed) return;
      const role = allowedRoles.has(msg.role ?? '') ? (msg.role as ChatMessage['role']) : 'user';
      const next: ChatMessage = { role, content: trimmed };
      if (msg.ts) next.ts = msg.ts as string;
      if (msg.toolName) next.toolName = msg.toolName as string;
      normalized.push(next);
    });
  }

  const trimmedPrompt = typeof prompt === 'string' ? prompt.trim() : '';
  if (trimmedPrompt) {
    const lastUser = [...normalized].reverse().find((m) => m.role === 'user');
    if (!lastUser || lastUser.content !== trimmedPrompt) {
      normalized.push({ role: 'user', content: trimmedPrompt });
    }
  }

  return normalized;
}

export function resolvePrompt(prompt: string | undefined, messages: ChatMessage[]): string {
  if (prompt && prompt.trim().length > 0) {
    return prompt.trim();
  }
  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  return lastUser?.content?.trim() ?? '';
}

export async function buildPolicySnapshot(
  teamId: number | null,
  toolAllowlist?: string[]
): Promise<TeamPolicy> {
  const base = await getTeamPolicy(teamId !== null ? String(teamId) : undefined);
  const allowlist = new Set<string>(base.allowlist?.tools ?? []);
  if (Array.isArray(toolAllowlist)) {
    toolAllowlist.forEach((tool: string) => {
      if (typeof tool === 'string' && tool.trim()) allowlist.add(tool);
    });
  }
  return {
    ...base,
    allowlist: {
      ...base.allowlist,
      tools: Array.from(allowlist),
    },
  };
}

export function initialStatusForMode(mode: string): RunStatus {
  switch (mode) {
    case 'preview':
      return RunStatus.PLANNING;
    case 'approval':
      return RunStatus.AWAITING_APPROVAL;
    case 'scheduled':
      return RunStatus.SCHEDULED;
    case 'auto':
    default:
      return RunStatus.QUEUED;
  }
}

export function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

export function extractInputFromConfig(config: Record<string, unknown>, fallbackPrompt: string) {
  const input = asRecord(config.input);
  const prompt =
    typeof input.prompt === 'string' && input.prompt.trim().length > 0 ? input.prompt : fallbackPrompt;
  const messages = Array.isArray(input.messages) ? (input.messages as ChatMessage[]) : undefined;
  return { prompt, messages };
}

export function buildMetaForJob(config: Record<string, unknown>, policy: TeamPolicy | null) {
  const meta = { ...asRecord(config.meta) };
  if (Array.isArray(config.channelTargets)) {
    meta.channelTargets = config.channelTargets;
  }
  if (Array.isArray(config.approvedSteps)) {
    meta.approvedSteps = config.approvedSteps;
  }
  if (policy) {
    meta.policy = policy;
  }
  return meta;
}

export function deriveScopesFromRun(
  run: { toolAllowlist: unknown },
  config: Record<string, unknown>,
  policy: TeamPolicy | null
): string[] {
  const scopes = new Set<string>(['runs:execute']);

  const targets = Array.isArray(config.channelTargets)
    ? (config.channelTargets as Array<any>)
    : [];
  targets.forEach((target: any) => {
    if (target && typeof target.appId === 'string') {
      scopes.add(`tool:${target.appId}`);
    }
    if (target && Array.isArray(target.scopes)) {
      target.scopes
        .filter((scope: unknown): scope is string => typeof scope === 'string')
        .forEach((scope: string) => scopes.add(scope));
    }
  });

  const allowlist = asRecord(run.toolAllowlist);
  if (Array.isArray(allowlist.tools)) {
    allowlist.tools
      .filter((tool: unknown): tool is string => typeof tool === 'string')
      .forEach((tool) => scopes.add(`tool:${tool}`));
  }

  if (policy?.allowlist?.scopes?.length) {
    policy.allowlist.scopes.forEach((scope) => scopes.add(scope));
  }

  return Array.from(scopes);
}
