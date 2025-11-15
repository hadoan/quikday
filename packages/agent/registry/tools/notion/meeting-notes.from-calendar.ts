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

const NotionMeetingNotesIn = z
  .object({
    pageId: z.string().optional(),
    databaseId: z.string().optional(),
    parentPageId: z.string().optional(),
    title: z.string().min(1),
    eventId: z.string().optional(),
    calendarName: z.string().optional(),
    startsAt: z.string().optional(),
    endsAt: z.string().optional(),
    attendees: z.array(z.string()).optional(),
    agenda: z.array(z.string()).optional(),
    discussionNotes: z.array(z.string()).optional(),
    decisions: z.array(z.string()).optional(),
    nextSteps: z.array(z.string()).optional(),
    followUps: z.array(z.string()).optional(),
    titlePropertyName: z.string().default('Name'),
    properties: z.record(z.string(), z.any()).optional(),
  })
  .refine(
    (val) => Boolean(val.pageId || val.databaseId || val.parentPageId),
    { message: 'Provide pageId or a target parent/database' },
  );

const NotionMeetingNotesOut = z.any();

export type NotionMeetingNotesArgs = z.infer<typeof NotionMeetingNotesIn>;
export type NotionMeetingNotesResult = z.infer<typeof NotionMeetingNotesOut>;

export function notionMeetingNotesFromCalendar(
  moduleRef: ModuleRef,
): Tool<NotionMeetingNotesArgs, NotionMeetingNotesResult> {
  return {
    name: 'notion.meetingNotes.fromCalendar',
    description:
      'Generate structured meeting notes (agenda, attendees, next steps) from calendar context.',
    in: NotionMeetingNotesIn,
    out: NotionMeetingNotesOut,
    apps: ['notion-productivity'],
    scopes: [],
    rate: '20/m',
    risk: 'low',
    async call(args, ctx: RunCtx) {
      const input = NotionMeetingNotesIn.parse(args);
      const svc = getNotionSvc(moduleRef);
      const auth = getNotionAuthFromCtx(ctx);
      const sections: SimpleSection[] = [];
      const overviewKeyValues = [];
      if (input.calendarName) overviewKeyValues.push({ label: 'Calendar', value: input.calendarName });
      if (input.startsAt) overviewKeyValues.push({ label: 'Starts', value: input.startsAt });
      if (input.endsAt) overviewKeyValues.push({ label: 'Ends', value: input.endsAt });
      if (input.eventId) overviewKeyValues.push({ label: 'Event ID', value: input.eventId });
      if (overviewKeyValues.length || input.attendees?.length) {
        sections.push({
          title: 'Meeting info',
          keyValues: overviewKeyValues,
          bullets: input.attendees?.length ? [`Attendees: ${input.attendees.join(', ')}`] : undefined,
        });
      }
      if (input.agenda?.length) {
        sections.push({ title: 'Agenda', bullets: input.agenda });
      }
      if (input.discussionNotes?.length) {
        sections.push({ title: 'Discussion', bullets: input.discussionNotes });
      }
      if (input.decisions?.length) {
        sections.push({ title: 'Decisions', bullets: input.decisions });
      }
      if (input.nextSteps?.length) {
        sections.push({ title: 'Next steps', bullets: input.nextSteps });
      }
      if (input.followUps?.length) {
        sections.push({ title: 'Follow-ups', bullets: input.followUps });
      }
      const children = [
        headingBlock('Meeting notes', 1),
        paragraphBlock(`Captured for ${input.title}`),
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
      return NotionMeetingNotesOut.parse(res);
    },
  };
}
