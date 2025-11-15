import { z } from 'zod';
import type { Tool } from '../../types.js';
import type { RunCtx } from '../../../state/types.js';
import { ModuleRef } from '@nestjs/core';
import { getNotionAuthFromCtx, getNotionSvc } from './helpers.js';

const NotionBlocksAppendIn = z.object({
  blockId: z.string().min(1, 'blockId is required').describe('The parent block or page id'),
  children: z
    .array(z.any())
    .nonempty()
    .describe('Notion block payloads to append'),
});

const NotionBlocksAppendOut = z.any();

export type NotionBlocksAppendArgs = z.infer<typeof NotionBlocksAppendIn>;
export type NotionBlocksAppendResult = z.infer<typeof NotionBlocksAppendOut>;

export function notionBlocksAppend(
  moduleRef: ModuleRef,
): Tool<NotionBlocksAppendArgs, NotionBlocksAppendResult> {
  return {
    name: 'notion.blocks.append',
    description: 'Append blocks to an existing Notion page or block',
    in: NotionBlocksAppendIn,
    out: NotionBlocksAppendOut,
    apps: ['notion-productivity'],
    scopes: [],
    rate: '60/m',
    risk: 'low',
    async call(args, ctx: RunCtx) {
      const input = NotionBlocksAppendIn.parse(args);
      const svc = getNotionSvc(moduleRef);
      const auth = getNotionAuthFromCtx(ctx);
      const res = await svc.appendBlocks({ blockId: input.blockId, children: input.children }, auth);
      return NotionBlocksAppendOut.parse(res);
    },
  };
}
