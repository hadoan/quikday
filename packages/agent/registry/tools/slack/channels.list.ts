import { z } from 'zod';
import type { Tool } from '../../types.js';
import type { RunCtx } from '../../../state/types.js';
import { ModuleRef } from '@nestjs/core';
import { PrismaService } from '@quikday/prisma';
import { CurrentUserService } from '@quikday/libs';

export const SlackChannelsListIn = z.object({
  types: z.string().optional(),
  limit: z.number().int().min(1).max(1000).optional(),
  cursor: z.string().optional(),
  query: z.string().optional(),
});

export const SlackChannelsListOut = z.object({
  channels: z.array(
    z.object({ id: z.string(), name: z.string(), is_private: z.boolean().optional(), is_member: z.boolean().optional() }),
  ),
  nextCursor: z.string().optional(),
});

export type SlackChannelsListArgs = z.infer<typeof SlackChannelsListIn>;
export type SlackChannelsListResult = z.infer<typeof SlackChannelsListOut>;

export function slackChannelsList(moduleRef: ModuleRef): Tool<SlackChannelsListArgs, SlackChannelsListResult> {
  return {
    name: 'slack.channels.list',
    description: 'List Slack channels available to the bot. Optional: types, limit, cursor, query.',
    in: SlackChannelsListIn,
    out: SlackChannelsListOut,
    apps: ['slack-messaging'],
    scopes: ['slack:read'],
    rate: '120/m',
    risk: 'low',
    async call(args, _ctx: RunCtx) {
      const input = SlackChannelsListIn.parse(args);
      const pkg = '@quikday/appstore-slack-messaging' as string;
      const m: any = await import(pkg);
      const SlackMessagingService = (m as any).SlackMessagingService;
      let svc = moduleRef.get(SlackMessagingService as any, { strict: false }) as any;
      if (!svc) {
        // Fallback: construct service with required deps
        const prisma = moduleRef.get(PrismaService, { strict: false });
        const currentUser = moduleRef.get(CurrentUserService, { strict: false });
        if (!prisma || !currentUser) throw new Error('SlackMessagingService unavailable');
        svc = new SlackMessagingService(prisma as any, currentUser as any);
      }
      const res = await svc.listChannels(input);
      return SlackChannelsListOut.parse(res);
    },
  };
}
