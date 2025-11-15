import { z } from 'zod';
import type { Tool } from '../../types.js';
import type { RunCtx } from '../../../state/types.js';
import { ModuleRef } from '@nestjs/core';
import {
  getNotionAuthFromCtx,
  getNotionSvc,
  headingBlock,
  notionText,
  paragraphBlock,
  titleProperty,
} from './helpers.js';

const PropertyMappings = z
  .object({
    name: z.string().default('Name'),
    email: z.string().default('Email'),
    company: z.string().default('Company'),
    title: z.string().default('Title'),
    phone: z.string().default('Phone'),
    notes: z.string().default('Notes'),
  })
  .partial();

const NotionContactFromEmailIn = z.object({
  databaseId: z.string().min(1),
  email: z.string().email(),
  name: z.string().optional(),
  company: z.string().optional(),
  title: z.string().optional(),
  phone: z.string().optional(),
  notes: z.string().optional(),
  propertyMappings: PropertyMappings.optional(),
  properties: z.record(z.string(), z.any()).optional(),
  updateProperties: z.record(z.string(), z.any()).optional(),
  filter: z.record(z.string(), z.any()).optional(),
});

const NotionContactFromEmailOut = z.object({
  pageId: z.string(),
  created: z.boolean(),
});

export type NotionContactFromEmailArgs = z.infer<typeof NotionContactFromEmailIn>;
export type NotionContactFromEmailResult = z.infer<typeof NotionContactFromEmailOut>;

export function notionContactFromEmailThread(
  moduleRef: ModuleRef,
): Tool<NotionContactFromEmailArgs, NotionContactFromEmailResult> {
  return {
    name: 'notion.contact.fromEmailThread',
    description: 'Find or create a Notion contact row from email metadata and append conversation notes.',
    in: NotionContactFromEmailIn,
    out: NotionContactFromEmailOut,
    apps: ['notion-productivity'],
    scopes: [],
    rate: '30/m',
    risk: 'low',
    async call(args, ctx: RunCtx) {
      const input = NotionContactFromEmailIn.parse(args);
      const svc = getNotionSvc(moduleRef);
      const auth = getNotionAuthFromCtx(ctx);
      const mapping = {
        name: input.propertyMappings?.name || 'Name',
        email: input.propertyMappings?.email || 'Email',
        company: input.propertyMappings?.company || 'Company',
        title: input.propertyMappings?.title || 'Title',
        phone: input.propertyMappings?.phone || 'Phone',
        notes: input.propertyMappings?.notes || 'Notes',
      };
      const properties: Record<string, any> = {
        [mapping.name]: titleProperty(input.name || input.email),
        ...(input.properties || {}),
      };
      if (!input.properties?.[mapping.email]) {
        properties[mapping.email] = { email: input.email };
      }
      if (input.company && !input.properties?.[mapping.company]) {
        properties[mapping.company] = { rich_text: notionText(input.company) };
      }
      if (input.title && !input.properties?.[mapping.title]) {
        properties[mapping.title] = { rich_text: notionText(input.title) };
      }
      if (input.phone && !input.properties?.[mapping.phone]) {
        properties[mapping.phone] = { phone_number: input.phone };
      }
      if (input.notes && !input.properties?.[mapping.notes]) {
        properties[mapping.notes] = { rich_text: notionText(input.notes) };
      }
      const updateProperties = input.updateProperties
        ? { ...input.updateProperties }
        : properties;
      const defaultFilter = {
        property: mapping.email,
        rich_text: { equals: input.email },
      };
      const res = await svc.findOrCreateDatabaseEntry(
        {
          databaseId: input.databaseId,
          properties,
          filter: input.filter || defaultFilter,
          updateOnMatch: updateProperties,
          children: input.notes
            ? [headingBlock('Latest note', 3), paragraphBlock(input.notes)]
            : undefined,
        },
        auth,
      );
      if (!res.created && input.notes) {
        await svc.appendBlocks(
          {
            blockId: res.page.id,
            children: [headingBlock('Latest note', 3), paragraphBlock(input.notes)],
          },
          auth,
        );
      }
      return { pageId: res.page.id, created: res.created };
    },
  };
}
