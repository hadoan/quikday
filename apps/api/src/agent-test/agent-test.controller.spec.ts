// import { describe, it, expect, beforeEach, vi } from 'vitest';
// import { AgentTestController } from './agent-test.controller.js';
// import { DEFAULT_AGENT_TEST_PROMPT } from '@quikday/agent/testPrompt';
// import type { RunState } from '@quikday/agent/state/types';
// import type { AgentService } from '@quikday/agent/nest';

// describe('AgentTestController', () => {
//   let controller: AgentTestController;
//   let agentService: { run: ReturnType<typeof vi.fn> };
//   let captured: { state: RunState | null; entryPoint: string | null };

//   beforeEach(() => {
//     captured = { state: null, entryPoint: null };
//     agentService = {
//       run: vi.fn(async (state: RunState, entryPoint: string) => {
//         captured = { state, entryPoint };
//         return state;
//       }),
//     };

//     controller = new AgentTestController(agentService as unknown as AgentService);
//   });

//   it('uses default values when minimal input is provided', async () => {
//     const response = await controller.run({});

//     expect(agentService.run).toHaveBeenCalledTimes(1);
//     expect(captured.entryPoint).toBe('classify');
//     expect(captured.state?.input.prompt).toBe(DEFAULT_AGENT_TEST_PROMPT);
//     expect(captured.state?.mode).toBe('PLAN');
//     expect(captured.state?.ctx.userId).toBe('1');
//     expect(captured.state?.ctx.scopes).toEqual(['runs:execute']);
//     expect(captured.state?.ctx.tz).toBe('UTC');

//     expect(response.prompt).toBe(DEFAULT_AGENT_TEST_PROMPT);
//     expect(response.mode).toBe('PLAN');
//     expect(response.entryPoint).toBe('classify');
//     expect(response.result).toBe(captured.state);
//   });

//   it('normalizes provided payload', async () => {
//     const now = '2025-01-01T09:00:00Z';
//     const body = {
//       prompt: '   Custom prompt ',
//       userId: '42',
//       teamId: '7',
//       mode: 'auto' as const,
//       runId: 'custom-run',
//       traceId: 'trace-123',
//       tz: 'Europe/Berlin',
//       now,
//       scopes: ['runs:execute', 'calendar:write'],
//       entryPoint: 'planner' as const,
//       messages: [{ role: 'user', content: 'Hi there!' }],
//     };

//     const response = await controller.run(body);

//     expect(agentService.run).toHaveBeenCalledTimes(1);
//     expect(captured.entryPoint).toBe('planner');
//     expect(captured.state?.input.prompt).toBe('Custom prompt');
//     expect(captured.state?.ctx.userId).toBe('42');
//     expect(captured.state?.ctx.teamId).toBe('7');
//     expect(captured.state?.ctx.traceId).toBe('trace-123');
//     expect(captured.state?.ctx.tz).toBe('Europe/Berlin');
//     expect(captured.state?.ctx.now.toISOString()).toBe(now);
//     expect(captured.state?.ctx.scopes).toEqual(['runs:execute', 'calendar:write']);
//     expect(captured.state?.mode).toBe('AUTO');
//     expect(captured.state?.input.messages).toEqual([{ role: 'user', content: 'Hi there!' }]);

//     expect(response.runId).toBe('custom-run');
//     expect(response.mode).toBe('AUTO');
//     expect(response.prompt).toBe('Custom prompt');
//     expect(response.entryPoint).toBe('planner');
//   });

//   it('throws when `now` is invalid', async () => {
//     await expect(
//       controller.run({
//         now: 'not-a-date',
//       }),
//     ).rejects.toThrow('Invalid `now` value; expected ISO 8601 string');
//   });
// });
