import { z } from 'zod';
import type { Tool } from '../../types.js';
import type { RunCtx } from '../../../state/types.js';
import { ModuleRef } from '@nestjs/core';
import { PrismaService } from '@quikday/prisma';
import { CurrentUserService } from '@quikday/libs';

export const SlackPostMessageIn = z.object({
  channel: z.string().describe('Channel name (with or without #) or channel ID'),
  text: z.string().min(1).describe('Message text'),
  thread_ts: z.string().optional().describe('Thread timestamp'),
});

export const SlackPostMessageOut = z.object({
  ok: z.boolean(),
  channel: z.string(),
  ts: z.string().optional(),
  url: z.string().optional(),
});

export type SlackPostMessageArgs = z.infer<typeof SlackPostMessageIn>;
export type SlackPostMessageResult = z.infer<typeof SlackPostMessageOut>;

export function slackPostMessage(moduleRef: ModuleRef): Tool<SlackPostMessageArgs, SlackPostMessageResult> {
  return {
    name: 'slack.postMessage',
    description: 'Post a message to a Slack channel. Required: channel, text. Optional: thread_ts.',
    in: SlackPostMessageIn,
    out: SlackPostMessageOut,
    apps: ['slack-messaging'],
    scopes: ['slack:write'],
    rate: '60/m',
    risk: 'low',
    async call(args, _ctx: RunCtx) {
      const input = SlackPostMessageIn.parse(args);
      const pkg = '@quikday/appstore-slack-messaging' as string;
      const m: any = await import(pkg);
      const SlackMessagingService = (m as any).SlackMessagingService;
      let svc = moduleRef.get(SlackMessagingService as any, { strict: false }) as any;
      if (!svc) {
        const prisma = moduleRef.get(PrismaService, { strict: false });
        const currentUser = moduleRef.get(CurrentUserService, { strict: false });
        if (!prisma || !currentUser) throw new Error('SlackMessagingService unavailable');
        svc = new SlackMessagingService(prisma as any, currentUser as any);
      }
      const res = await svc.postMessage({ channel: input.channel, text: input.text, thread_ts: input.thread_ts });
      return SlackPostMessageOut.parse(res);
    },
  };
}
