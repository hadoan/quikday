import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RunsController, type CreateRunDto } from './runs.controller';

describe('RunsController', () => {
  let controller: RunsController;
  const runsService = {
    createFromPrompt: vi.fn(),
  };

  beforeEach(() => {
    runsService.createFromPrompt.mockReset();
    controller = new RunsController(runsService as any);
  });

  it('forwards the request body and claims to RunsService', async () => {
    const body: CreateRunDto = {
      prompt: 'Schedule online call with ha@vendex.io at 3pm tomorrow for 30 minutes',
      mode: 'auto',
      teamId: 7,
    };
    const req = { user: { id: 1 } };
    const expectedResponse = { id: 'run-123', prompt: body.prompt };
    runsService.createFromPrompt.mockResolvedValue(expectedResponse);

    const result = await controller.create(body, req);

    expect(runsService.createFromPrompt).toHaveBeenCalledTimes(1);
    expect(runsService.createFromPrompt).toHaveBeenCalledWith(body, req.user);
    expect(result).toBe(expectedResponse);
  });
});
