import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Test, type TestingModule } from '@nestjs/testing';
import { AgentModule, AgentService } from '../nest/index.js';
import { DEFAULT_AGENT_TEST_PROMPT } from '../testPrompt.js';
import type { RunState } from '../state/types.js';
import type { LLM } from '../llm/types.js';

const prompt = DEFAULT_AGENT_TEST_PROMPT;

describe('AgentModule', () => {
  let moduleRef: TestingModule;
  let agent: AgentService;

  const stubLlm: LLM = {
    text: async () => '',
  };

  beforeEach(async () => {
    const testingModuleBuilder = Test.createTestingModule({
      imports: [AgentModule.forRoot({ llm: stubLlm })],
    });
    moduleRef = await testingModuleBuilder.compile();
    agent = moduleRef.get(AgentService);
  });

  afterEach(async () => {
    await moduleRef.close();
  });

  it('generates a calendar plan for scheduling prompt', async () => {
    const initialState: RunState = {
      input: { prompt },
      mode: 'PLAN',
      ctx: {
        runId: 'run-test',
        userId: '1',
        scopes: ['runs:execute'],
        traceId: 'trace-run-test',
        tz: 'UTC',
        now: new Date('2025-01-01T12:00:00Z'),
      },
      scratch: {},
      output: {},
    };

    const result = await agent.run(initialState);

    expect(result.scratch?.intent).toBe('calendar.schedule');
    expect(result.scratch?.plan?.length).toBe(2);
    expect(result.scratch?.plan?.map((step) => step.args?.action)).toEqual(['check_calendar', 'create_event']);

    const commit = result.output?.commits?.[0];
    expect(commit?.result).toMatchObject({ message: prompt });

    expect(result.output?.summary).toContain('Summary:');
  });
});
