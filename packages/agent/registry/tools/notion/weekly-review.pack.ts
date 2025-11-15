import { z } from 'zod';
import type { Tool } from '../../types.js';
import type { RunCtx } from '../../../state/types.js';
import { ModuleRef } from '@nestjs/core';
import {
  SimpleSection,
  buildSections,
  getNotionAuthFromCtx,
  getNotionSvc,
  headingBlock,
  paragraphBlock,
  titleProperty,
  upsertPageWithContent,
} from './helpers.js';

const NotionWeeklyReviewPackIn = z
  .object({
    pageId: z.string().optional(),
    databaseId: z.string().optional(),
    parentPageId: z.string().optional(),
    weekOf: z.string().min(1),
    wins: z.array(z.string()).optional(),
    metrics: z.array(z.string()).optional(),
    productUpdates: z.array(z.string()).optional(),
    pipeline: z.array(z.string()).optional(),
    hiring: z.array(z.string()).optional(),
    risks: z.array(z.string()).optional(),
    asks: z.array(z.string()).optional(),
    notes: z.string().optional(),
    titlePropertyName: z.string().default('Name'),
    properties: z.record(z.string(), z.any()).optional(),
  })
  .refine(
    (val) => Boolean(val.pageId || val.databaseId || val.parentPageId),
    { message: 'Provide pageId or target database/parent' },
  );

const NotionWeeklyReviewPackOut = z.any();

export type NotionWeeklyReviewPackArgs = z.infer<typeof NotionWeeklyReviewPackIn>;
export type NotionWeeklyReviewPackResult = z.infer<typeof NotionWeeklyReviewPackOut>;

export function notionWeeklyReviewPack(
  moduleRef: ModuleRef,
): Tool<NotionWeeklyReviewPackArgs, NotionWeeklyReviewPackResult> {
  return {
    name: 'notion.weeklyReview.pack',
    description: 'Generate a weekly review page covering wins, metrics, risks, and asks.',
    in: NotionWeeklyReviewPackIn,
    out: NotionWeeklyReviewPackOut,
    apps: ['notion-productivity'],
    scopes: [],
    rate: '15/m',
    risk: 'low',
    async call(args, ctx: RunCtx) {
      const input = NotionWeeklyReviewPackIn.parse(args);
      const svc = getNotionSvc(moduleRef);
      const auth = getNotionAuthFromCtx(ctx);
      const sections: SimpleSection[] = [];
      if (input.metrics?.length) sections.push({ title: 'Metrics', bullets: input.metrics });
      if (input.wins?.length) sections.push({ title: 'Wins', bullets: input.wins });
      if (input.productUpdates?.length)
        sections.push({ title: 'Product updates', bullets: input.productUpdates });
      if (input.pipeline?.length) sections.push({ title: 'Pipeline', bullets: input.pipeline });
      if (input.hiring?.length) sections.push({ title: 'Hiring', bullets: input.hiring });
      if (input.risks?.length) sections.push({ title: 'Risks / blockers', bullets: input.risks });
      if (input.asks?.length) sections.push({ title: 'Asks', bullets: input.asks });
      if (input.notes) sections.push({ title: 'Notes', body: input.notes });
      const properties =
        input.properties ??
        ({
          [input.titlePropertyName || 'Name']: titleProperty(`Weekly review — ${input.weekOf}`),
        } as Record<string, any>);
      const children = [
        headingBlock(`Weekly review — ${input.weekOf}`, 1),
        paragraphBlock('Auto-generated summary'),
        ...buildSections(sections),
      ];
      const res = await upsertPageWithContent(svc, auth, {
        pageId: input.pageId,
        databaseId: input.databaseId,
        parentPageId: input.parentPageId,
        properties,
        children,
      });
      return NotionWeeklyReviewPackOut.parse(res);
    },
  };
}
