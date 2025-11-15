import { z } from 'zod';
import type { Tool } from '../../types.js';
import type { RunCtx } from '../../../state/types.js';
import { ModuleRef } from '@nestjs/core';
import { getNotionAuthFromCtx, getNotionSvc } from './helpers.js';

const NotionBlocksReplaceIn = z.object({
  blockId: z.string().min(1, 'blockId is required'),
  children: z.array(z.any()).nonempty().describe('Blocks that should replace existing children'),
});

const NotionBlocksReplaceOut = z.any();

export type NotionBlocksReplaceArgs = z.infer<typeof NotionBlocksReplaceIn>;
export type NotionBlocksReplaceResult = z.infer<typeof NotionBlocksReplaceOut>;

export function notionBlocksReplace(
  moduleRef: ModuleRef,
): Tool<NotionBlocksReplaceArgs, NotionBlocksReplaceResult> {
  return {
    name: 'notion.blocks.replace',
    description: 'Replace the children blocks of a Notion page or block',
    in: NotionBlocksReplaceIn,
    out: NotionBlocksReplaceOut,
    apps: ['notion-productivity'],
    scopes: [],
    rate: '30/m',
    risk: 'low',
    async call(args, ctx: RunCtx) {
      const input = NotionBlocksReplaceIn.parse(args);
      const svc = getNotionSvc(moduleRef);
      const auth = getNotionAuthFromCtx(ctx);
      const res = await svc.replaceBlocks({ blockId: input.blockId, children: input.children }, auth);
      return NotionBlocksReplaceOut.parse(res);
    },
  };
}
