import { z } from 'zod';
import type { Tool } from '../types.js';
import type { RunCtx } from '../../state/types.js';
import { ModuleRef } from '@nestjs/core';
import { PrismaService } from '@quikday/prisma';

export const SlackChannelsListIn = z.object({
  types: z
    .string()
    .optional()
    .describe('Comma-separated types, e.g. public_channel,private_channel'),
  limit: z.number().int().min(1).max(1000).optional(),
  cursor: z.string().optional(),
  query: z.string().optional().describe('Optional name filter applied client-side'),
});

export const SlackChannelsListOut = z.object({
  channels: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      is_private: z.boolean().optional(),
      is_member: z.boolean().optional(),
    }),
  ),
  nextCursor: z.string().optional(),
});

export type SlackChannelsListArgs = z.infer<typeof SlackChannelsListIn>;
export type SlackChannelsListResult = z.infer<typeof SlackChannelsListOut>;

async function resolveAccessToken(moduleRef: ModuleRef, ctx: RunCtx): Promise<string> {
  const prisma = moduleRef.get(PrismaService, { strict: false });
  if (!prisma) throw new Error('PrismaService unavailable');
  const sub = ctx.userId;
  const user = await prisma.user.findUnique({ where: { sub } });
  if (!user) throw new Error('User not found');
  const cred = await prisma.credential.findFirst({
    where: { userId: user.id, invalid: false, appId: 'slack-messaging' },
    orderBy: { updatedAt: 'desc' },
  });
  const key: any = cred?.key ?? {};
  const token: string | undefined =
    typeof key?.access_token === 'string'
      ? key.access_token
      : typeof key?.token?.access_token === 'string'
        ? key.token.access_token
        : undefined;
  if (!token) throw new Error('Slack credential not found for user');
  return token;
}

export function slackChannelsList(moduleRef: ModuleRef): Tool<SlackChannelsListArgs, SlackChannelsListResult> {
  return {
    name: 'slack.channels.list',
    description:
      'List Slack channels available to the bot. Optional: types (public_channel,private_channel), limit, cursor, query (name filter).',
    in: SlackChannelsListIn,
    out: SlackChannelsListOut,
    apps: ['slack-messaging'],
    scopes: ['slack:read'],
    rate: '120/m',
    risk: 'low',
    async call(args, ctx: RunCtx) {
      const input = SlackChannelsListIn.parse(args);
      const token = await resolveAccessToken(moduleRef, ctx);
      const params = new URLSearchParams();
      params.set('types', input.types || 'public_channel,private_channel');
      if (input.limit) params.set('limit', String(input.limit));
      if (input.cursor) params.set('cursor', input.cursor);

      const resp = await fetch(`https://slack.com/api/conversations.list?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await resp.json();
      if (!json?.ok) {
        throw new Error(`Slack API error: ${json?.error || 'unknown_error'}`);
      }
      let channels: Array<{ id: string; name: string; is_private?: boolean; is_member?: boolean }> =
        Array.isArray(json.channels)
          ? json.channels.map((c: any) => ({
              id: String(c.id),
              name: String(c.name),
              is_private: Boolean(c.is_private),
              is_member: Boolean(c.is_member),
            }))
          : [];
      if (input.query && input.query.trim()) {
        const q = input.query.trim().toLowerCase();
        channels = channels.filter((c) => c.name.toLowerCase().includes(q));
      }
      const nextCursor = json?.response_metadata?.next_cursor || undefined;
      return SlackChannelsListOut.parse({ channels, nextCursor });
    },
  };
}

