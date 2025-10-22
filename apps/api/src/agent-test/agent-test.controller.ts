import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import { DEFAULT_AGENT_TEST_PROMPT } from '@quikday/agent/testPrompt';
import type { ChatMessage, RunMode, RunState } from '@quikday/agent/state/types';
import { Public } from '../auth/public.decorator';
import { AgentService } from '../agent';

type EntryPoint = 'classify' | 'planner' | 'confirm' | 'executor' | 'summarize' | 'fallback';

type ModeInput = RunMode | Lowercase<RunMode>;

export interface AgentGraphTestRequest {
  prompt?: string;
  userId?: string;
  teamId?: string;
  mode?: ModeInput;
  runId?: string;
  traceId?: string;
  tz?: string;
  now?: string;
  scopes?: string[];
  entryPoint?: EntryPoint;
  messages?: ChatMessage[];
}

export interface AgentGraphTestResponse {
  entryPoint: EntryPoint;
  prompt: string;
  runId: string;
  mode: RunMode;
  result: RunState;
}

@Controller('test/agent-graph')
export class AgentTestController {
  constructor(private readonly agent: AgentService) {}

  @Post()
  @Public()
  async run(@Body() body: AgentGraphTestRequest): Promise<AgentGraphTestResponse> {
    const prompt = this.normalizePrompt(body.prompt);
    const runId = body.runId?.trim() || `agent-test-${Date.now()}`;
    const tz = body.tz?.trim() || 'UTC';
    const now = body.now ? this.parseNow(body.now) : new Date();
    const mode = this.normalizeMode(body.mode);
    const scopes = this.normalizeScopes(body.scopes);
    const entryPoint: EntryPoint = body.entryPoint ?? 'classify';

    const initialState: RunState = {
      input: { prompt, messages: this.normalizeMessages(body.messages) },
      mode,
      ctx: {
        runId,
        userId: body.userId?.trim() || '1',
        teamId: body.teamId?.trim() || undefined,
        scopes,
        traceId: body.traceId?.trim() || `agent-test:${runId}`,
        tz,
        now,
      },
      scratch: {},
      output: {},
    };

    const result = await this.agent.run(initialState, entryPoint);

    return {
      entryPoint,
      prompt,
      runId: result.ctx.runId,
      mode: result.mode,
      result,
    };
  }

  private normalizePrompt(prompt?: string) {
    const normalized = prompt?.trim();
    return normalized && normalized.length > 0 ? normalized : DEFAULT_AGENT_TEST_PROMPT;
  }

  private parseNow(now: string) {
    const parsed = new Date(now);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException('Invalid `now` value; expected ISO 8601 string');
    }
    return parsed;
  }

  private normalizeMode(mode?: ModeInput): RunMode {
    if (!mode) return 'PLAN';
    const upper = mode.toUpperCase();
    return upper === 'AUTO' ? 'AUTO' : 'PLAN';
  }

  private normalizeScopes(input?: string[]) {
    if (!Array.isArray(input)) return ['runs:execute'];
    const scopes = input.map((scope) => scope?.trim()).filter((scope): scope is string => Boolean(scope));
    return scopes.length > 0 ? scopes : ['runs:execute'];
  }

  private normalizeMessages(messages?: ChatMessage[]) {
    if (!Array.isArray(messages)) return undefined;
    return messages.filter((msg): msg is ChatMessage => {
      if (!msg || typeof msg !== 'object') return false;
      if (!('role' in msg) || !('content' in msg)) return false;
      if (typeof msg.role !== 'string' || typeof msg.content !== 'string') return false;
      return ['system', 'user', 'assistant', 'tool'].includes(msg.role);
    });
  }
}
