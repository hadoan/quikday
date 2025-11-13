import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Job } from 'bullmq';
import { RunProcessor } from './run.processor.js';
import { RunStatus } from '@prisma/client';

const graphRunMock = vi.fn();

class FakeRedisPubSubService {
  public published: Array<{ runId: string; event: any }> = [];
  private handlers = new Map<string, (event: any) => void>();

  async publishRunEvent(runId: string, event: any): Promise<void> {
    this.published.push({ runId, event });
  }

  onRunEvent(runId: string, handler: (event: any) => void): () => void {
    const key = this.keyFor(runId);
    this.handlers.set(key, handler);
    return () => {
      this.handlers.delete(key);
    };
  }

  emit(runId: string, event: any) {
    const handler = this.handlers.get(this.keyFor(runId));
    if (handler) handler(event);
  }

  hasHandler(runId: string): boolean {
    return this.handlers.has(this.keyFor(runId));
  }

  private keyFor(runId: string) {
    return `run:${runId}`;
  }
}

describe('RunProcessor.process', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    graphRunMock.mockReset();
  });

  it('persists run results and publishes events on success', async () => {
    const runsService = {
      get: vi.fn(),
      updateStatus: vi.fn(),
      persistResult: vi.fn(),
    };
    runsService.get.mockResolvedValue({
      id: 'run-123',
      prompt: 'Write a happy birthday email',
      mode: 'auto',
      userId: 42,
      teamId: 7,
      config: { input: { prompt: 'Write a happy birthday email' }, meta: {} },
      policySnapshot: { allowlist: { tools: [], scopes: [] } },
      RunScopedKeys: [],
    });
    runsService.updateStatus.mockResolvedValue(undefined);
    runsService.persistResult.mockResolvedValue(undefined);

    const telemetry = {
      track: vi.fn().mockResolvedValue(undefined),
    };

    const agentService = {
      createGraph: vi.fn(() => ({ run: graphRunMock })),
    };

    const redis = new FakeRedisPubSubService();
    const processor = new RunProcessor(
      runsService as any,
      telemetry as any,
      redis as any,
      agentService as any
    );

    graphRunMock.mockImplementation(async (_entry, initialState) => {
      redis.emit('run-123', {
        runId: 'run-123',
        type: 'tool.called',
        payload: { name: 'calendar.createEvent', args: { title: 'Birthday party' } },
        ts: new Date().toISOString(),
      });
      redis.emit('run-123', {
        runId: 'run-123',
        type: 'tool.succeeded',
        payload: { name: 'calendar.createEvent', result: { ok: true }, ms: 95 },
        ts: new Date().toISOString(),
      });
      redis.emit('run-123', {
        runId: 'run-123',
        type: 'run_completed',
        payload: { summary: 'All done' },
        ts: new Date().toISOString(),
      });
      return {
        ...initialState,
        output: { summary: 'All done' },
      };
    });

    const job = {
      id: 'job-1',
      data: { runId: 'run-123' },
      attemptsMade: 0,
      processedOn: Date.now() - 50,
    } as unknown as Job<any>;

    await processor.process(job);

    expect(runsService.get).toHaveBeenCalledWith('run-123');
    expect(runsService.updateStatus).toHaveBeenNthCalledWith(1, 'run-123', RunStatus.RUNNING);
    expect(runsService.updateStatus).toHaveBeenNthCalledWith(2, 'run-123', RunStatus.DONE);
    expect(runsService.persistResult).toHaveBeenCalledWith(
      'run-123',
      expect.objectContaining({
        output: { summary: 'All done' },
        logs: expect.arrayContaining([
          expect.objectContaining({
            tool: 'calendar.createEvent',
            action: 'Completed calendar.createEvent',
            status: 'succeeded',
            request: { title: 'Birthday party' },
            result: { ok: true },
          }),
        ]),
      })
    );
    expect(redis.published.some((entry) => entry.event.type === 'run_completed')).toBe(true);
    expect(redis.hasHandler('run-123')).toBe(false);
    expect(telemetry.track).toHaveBeenCalledWith('run_completed', {
      runId: 'run-123',
      status: RunStatus.DONE,
    });
    expect(agentService.createGraph).toHaveBeenCalledTimes(1);
  });

  it('bails out when job is missing a runId', async () => {
    const runsService = {
      get: vi.fn(),
      updateStatus: vi.fn(),
      persistResult: vi.fn(),
    };
    const telemetry = { track: vi.fn() };
    const agentService = {
      createGraph: vi.fn(() => ({ run: graphRunMock })),
    };
    const redis = new FakeRedisPubSubService();
    const processor = new RunProcessor(
      runsService as any,
      telemetry as any,
      redis as any,
      agentService as any
    );

    const job = {
      id: 'job-2',
      data: {},
      attemptsMade: 0,
    } as unknown as Job<any>;

    await processor.process(job);

    expect(runsService.get).not.toHaveBeenCalled();
    expect(runsService.updateStatus).not.toHaveBeenCalled();
    expect(runsService.persistResult).not.toHaveBeenCalled();
    expect(agentService.createGraph).not.toHaveBeenCalled();
  });
});
