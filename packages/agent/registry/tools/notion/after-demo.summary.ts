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

const NotionAfterDemoSummaryIn = z
  .object({
    pageId: z.string().optional(),
    databaseId: z.string().optional(),
    parentPageId: z.string().optional(),
    title: z.string().min(1),
    titlePropertyName: z.string().default('Name'),
    meetingDate: z.string().optional(),
    attendees: z.array(z.string()).optional(),
    recap: z.string().optional(),
    actionItems: z.array(z.string()).optional(),
    blockers: z.array(z.string()).optional(),
    decisions: z.array(z.string()).optional(),
    followUps: z.array(z.string()).optional(),
    transcriptSummary: z.string().optional(),
    transcriptUrl: z.string().url().optional(),
    properties: z.record(z.string(), z.any()).optional(),
  })
  .refine(
    (val) => Boolean(val.pageId || val.databaseId || val.parentPageId),
    { message: 'Provide pageId or target database/parent page' },
  );

const NotionAfterDemoSummaryOut = z.any();

export type NotionAfterDemoSummaryArgs = z.infer<typeof NotionAfterDemoSummaryIn>;
export type NotionAfterDemoSummaryResult = z.infer<typeof NotionAfterDemoSummaryOut>;

export function notionAfterDemoSummaryToNotion(
  moduleRef: ModuleRef,
): Tool<NotionAfterDemoSummaryArgs, NotionAfterDemoSummaryResult> {
  return {
    name: 'notion.afterDemoSummary.upsert',
    description: 'Create or update a Notion page that captures demo highlights, blockers, and follow-ups.',
    in: NotionAfterDemoSummaryIn,
    out: NotionAfterDemoSummaryOut,
    apps: ['notion-productivity'],
    scopes: [],
    rate: '15/m',
    risk: 'low',
    async call(args, ctx: RunCtx) {
      const input = NotionAfterDemoSummaryIn.parse(args);
      const svc = getNotionSvc(moduleRef);
      const auth = getNotionAuthFromCtx(ctx);
      const sections: SimpleSection[] = [];
      if (input.meetingDate || input.attendees?.length) {
        const keyValues = [];
        if (input.meetingDate) keyValues.push({ label: 'Meeting date', value: input.meetingDate });
        if (input.attendees?.length)
          keyValues.push({ label: 'Attendees', value: input.attendees.join(', ') });
        sections.push({ title: 'Context', keyValues });
      }
      if (input.recap) {
        sections.push({ title: 'Recap', body: input.recap });
      }
      if (input.actionItems?.length) {
        sections.push({ title: 'Action items', bullets: input.actionItems });
      }
      if (input.followUps?.length) {
        sections.push({ title: 'Follow-ups', bullets: input.followUps });
      }
      if (input.blockers?.length) {
        sections.push({ title: 'Risks / blockers', bullets: input.blockers });
      }
      if (input.decisions?.length) {
        sections.push({ title: 'Decisions', bullets: input.decisions });
      }
      if (input.transcriptSummary || input.transcriptUrl) {
        sections.push({
          title: 'Transcript',
          body: input.transcriptSummary,
          bullets: input.transcriptUrl ? [`Transcript: ${input.transcriptUrl}`] : undefined,
        });
      }
      const children = [
        headingBlock('Demo summary', 1),
        paragraphBlock(`Auto-generated for ${input.title}`),
        ...buildSections(sections),
      ].filter(Boolean);
      const properties =
        input.properties ??
        ({
          [input.titlePropertyName || 'Name']: titleProperty(input.title),
        } as Record<string, any>);
      const res = await upsertPageWithContent(svc, auth, {
        pageId: input.pageId,
        databaseId: input.databaseId,
        parentPageId: input.parentPageId,
        properties,
        children,
      });
      return NotionAfterDemoSummaryOut.parse(res);
    },
  };
}
