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

const NotionDemoPrepBriefIn = z
  .object({
    pageId: z.string().optional(),
    databaseId: z.string().optional(),
    parentPageId: z.string().optional(),
    title: z.string().min(1),
    titlePropertyName: z.string().default('Name'),
    company: z.string().optional(),
    meetingDate: z.string().optional(),
    attendees: z.array(z.string()).optional(),
    context: z.string().optional(),
    summary: z.string().optional(),
    openIssues: z.array(z.string()).optional(),
    nextSteps: z.array(z.string()).optional(),
    prepNotes: z.array(z.string()).optional(),
    links: z.array(z.object({ label: z.string(), url: z.string().optional() })).optional(),
    properties: z.record(z.string(), z.any()).optional(),
  })
  .refine(
    (val) => Boolean(val.pageId || val.databaseId || val.parentPageId),
    { message: 'Provide pageId or a target databaseId/parentPageId' },
  );

const NotionDemoPrepBriefOut = z.any();

export type NotionDemoPrepBriefArgs = z.infer<typeof NotionDemoPrepBriefIn>;
export type NotionDemoPrepBriefResult = z.infer<typeof NotionDemoPrepBriefOut>;

export function notionDemoPrepBriefUpsert(
  moduleRef: ModuleRef,
): Tool<NotionDemoPrepBriefArgs, NotionDemoPrepBriefResult> {
  return {
    name: 'notion.demoPrepBrief.upsert',
    description:
      'Create or refresh a structured “Demo prep brief” page with context, attendees, open questions, and next steps.',
    in: NotionDemoPrepBriefIn,
    out: NotionDemoPrepBriefOut,
    apps: ['notion-productivity'],
    scopes: [],
    rate: '15/m',
    risk: 'low',
    async call(args, ctx: RunCtx) {
      const input = NotionDemoPrepBriefIn.parse(args);
      const svc = getNotionSvc(moduleRef);
      const auth = getNotionAuthFromCtx(ctx);
      const sections: SimpleSection[] = [];
      if (input.company || input.meetingDate || input.context) {
        const keyValues = [];
        if (input.company) keyValues.push({ label: 'Company', value: input.company });
        if (input.meetingDate) keyValues.push({ label: 'Meeting', value: input.meetingDate });
        sections.push({
          title: 'Overview',
          body: input.context,
          keyValues,
        });
      }
      if (input.attendees?.length) {
        sections.push({ title: 'Attendees', bullets: input.attendees });
      }
      if (input.summary) {
        sections.push({ title: 'Summary', body: input.summary });
      }
      if (input.openIssues?.length) {
        sections.push({ title: 'Open issues', bullets: input.openIssues });
      }
      if (input.nextSteps?.length) {
        sections.push({ title: 'Next steps', bullets: input.nextSteps });
      }
      if (input.prepNotes?.length) {
        sections.push({ title: 'Prep notes', bullets: input.prepNotes });
      }
      if (input.links?.length) {
        sections.push({
          title: 'Links',
          bullets: input.links.map((link) =>
            link.url ? `${link.label}: ${link.url}` : link.label,
          ),
        });
      }
      const children = [
        headingBlock('Demo prep brief', 1),
        paragraphBlock(`Generated for ${input.title}`),
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
      return NotionDemoPrepBriefOut.parse(res);
    },
  };
}
