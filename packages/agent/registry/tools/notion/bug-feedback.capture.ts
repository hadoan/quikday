import { z } from 'zod';
import type { Tool } from '../../types.js';
import type { RunCtx } from '../../../state/types.js';
import { ModuleRef } from '@nestjs/core';
import {
  bulletedListBlocks,
  getNotionAuthFromCtx,
  getNotionSvc,
  headingBlock,
  paragraphBlock,
  titleProperty,
} from './helpers.js';

const NotionBugFeedbackCaptureIn = z.object({
  databaseId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  source: z.string().optional(),
  severity: z.string().optional(),
  type: z.enum(['bug', 'feedback']).default('bug'),
  stepsToReproduce: z.array(z.string()).optional(),
  attachments: z.array(z.string()).optional(),
  expected: z.string().optional(),
  actual: z.string().optional(),
  properties: z.record(z.string(), z.any()).optional(),
  titlePropertyName: z.string().default('Name'),
});

const NotionBugFeedbackCaptureOut = z.object({
  pageId: z.string(),
  url: z.string().optional(),
});

export type NotionBugFeedbackCaptureArgs = z.infer<typeof NotionBugFeedbackCaptureIn>;
export type NotionBugFeedbackCaptureResult = z.infer<typeof NotionBugFeedbackCaptureOut>;

export function notionBugFeedbackCapture(
  moduleRef: ModuleRef,
): Tool<NotionBugFeedbackCaptureArgs, NotionBugFeedbackCaptureResult> {
  return {
    name: 'notion.bugFeedback.capture',
    description: 'Create a Notion entry for a bug or feedback item with reproduction notes.',
    in: NotionBugFeedbackCaptureIn,
    out: NotionBugFeedbackCaptureOut,
    apps: ['notion-productivity'],
    scopes: [],
    rate: '45/m',
    risk: 'low',
    async call(args, ctx: RunCtx) {
      const input = NotionBugFeedbackCaptureIn.parse(args);
      const svc = getNotionSvc(moduleRef);
      const auth = getNotionAuthFromCtx(ctx);
      const childBlocks = [
        headingBlock('Summary', 2),
        paragraphBlock(input.description),
      ];
      if (input.expected || input.actual) {
        childBlocks.push(headingBlock('Expected vs actual', 3));
        if (input.expected) childBlocks.push(paragraphBlock(`Expected: ${input.expected}`));
        if (input.actual) childBlocks.push(paragraphBlock(`Actual: ${input.actual}`));
      }
      if (input.stepsToReproduce?.length) {
        childBlocks.push(headingBlock('Steps to reproduce', 3));
        childBlocks.push(...bulletedListBlocks(input.stepsToReproduce));
      }
      if (input.attachments?.length) {
        childBlocks.push(headingBlock('Attachments', 3));
        childBlocks.push(
          ...bulletedListBlocks(
            input.attachments.map((link) => link.startsWith('http') ? link : `Attachment: ${link}`),
          ),
        );
      }
      if (input.source || input.severity || input.type) {
        childBlocks.push(
          headingBlock('Meta', 3),
          paragraphBlock(
            [
              `Type: ${input.type}`,
              input.source ? `Source: ${input.source}` : '',
              input.severity ? `Severity: ${input.severity}` : '',
            ]
              .filter(Boolean)
              .join(' • '),
          ),
        );
      }
      const properties =
        input.properties ??
        ({
          [input.titlePropertyName || 'Name']: titleProperty(input.title),
        } as Record<string, any>);
      const page = await svc.createPage(
        {
          databaseId: input.databaseId,
          properties,
          children: childBlocks,
        },
        auth,
      );
      return { pageId: page.id, url: page.url };
    },
  };
}
