import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test, type TestingModule } from '@nestjs/testing';
import { AgentModule, AgentService, AGENT_LLM } from '../nest/index.js';
import type { RunState } from '../state/types.js';
import type { LLM } from '../llm/types.js';

const describeIfOpenAI = process.env.OPENAI_API_KEY ? describe : describe.skip;

describeIfOpenAI('AgentModule (real LLM)', () => {
  let moduleRef: TestingModule;
  let agent: AgentService;
  let llm: LLM;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AgentModule.forRoot()],
    }).compile();
    agent = moduleRef.get(AgentService);
    llm = moduleRef.get(AGENT_LLM);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  it('plans scheduling prompt and reaches OpenAI', async () => {
    const prompt = 'Schedule an online call with ha@yopmail.com at 10 pm tomorrow';

    const initialState: RunState = {
      input: { prompt },
      mode: 'PLAN',
      ctx: {
        runId: 'run-real-llm',
        userId: '1',
        scopes: ['runs:execute'],
        traceId: 'trace-real-llm',
        tz: 'UTC',
        now: new Date('2025-01-01T12:00:00Z'),
      },
      scratch: {},
      output: {},
    };

    const result = await agent.run(initialState);

    expect(result.scratch?.intent).toBe('calendar.schedule');
    expect(result.scratch?.plan?.map((step) => step.args?.action)).toEqual(['check_calendar', 'create_event']);
    expect(result.output?.summary).toContain('Summary:');

    const llmReply = await llm.text({
      system: 'Reply concisely.',
      user: 'Respond with the single word ACK.',
      maxTokens: 3,
      temperature: 0,
      metadata: {
        userId: 42,
        teamId: 7,
        requestType: 'unit_test',
        apiEndpoint: 'vitest',
      },
    });

    expect(llmReply.trim().toLowerCase()).toContain('ack');
  });
});
