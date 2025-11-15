import { z } from 'zod';
import type { Tool } from '../../types.js';
import type { RunCtx } from '../../../state/types.js';
import { ModuleRef } from '@nestjs/core';
import { getNotionAuthFromCtx, getNotionSvc } from './helpers.js';

const NotionTaskDigestIn = z.object({
  databaseId: z.string().min(1),
  date: z.string().min(1).describe('Target date (YYYY-MM-DD) used for filtering'),
  datePropertyName: z.string().default('Due'),
  includeOverdue: z.boolean().default(true),
  titlePropertyName: z.string().default('Name'),
  statusPropertyName: z.string().optional(),
  assigneePropertyName: z.string().optional(),
  filter: z.record(z.string(), z.any()).optional(),
  sorts: z.array(z.record(z.string(), z.any())).optional(),
  limit: z.number().int().positive().max(100).optional(),
});

const TaskDigestTask = z.object({
  id: z.string(),
  title: z.string(),
  status: z.string().optional(),
  dueDate: z.string().nullable().optional(),
  assignees: z.array(z.string()).optional(),
  url: z.string().optional(),
  overdue: z.boolean(),
});

const NotionTaskDigestOut = z.object({
  total: z.number().int().nonnegative(),
  overdueCount: z.number().int().nonnegative(),
  tasks: z.array(TaskDigestTask),
  nextCursor: z.string().optional(),
});

export type NotionTaskDigestArgs = z.infer<typeof NotionTaskDigestIn>;
export type NotionTaskDigestResult = z.infer<typeof NotionTaskDigestOut>;

function extractTitle(page: any, propertyName: string) {
  const prop = page?.properties?.[propertyName];
  if (!prop) return 'Untitled task';
  if (prop.type === 'title' && Array.isArray(prop.title)) {
    const text = prop.title.map((t: any) => t?.plain_text || t?.text?.content || '').join('').trim();
    if (text) return text;
  }
  if (prop.type === 'rich_text' && Array.isArray(prop.rich_text)) {
    const text = prop.rich_text.map((t: any) => t?.plain_text || '').join('').trim();
    if (text) return text;
  }
  return 'Untitled task';
}

function extractDate(page: any, propertyName: string) {
  const prop = page?.properties?.[propertyName];
  if (prop?.type === 'date') {
    return prop.date?.start || null;
  }
  return null;
}

function extractStatus(page: any, propertyName?: string) {
  if (!propertyName) return undefined;
  const prop = page?.properties?.[propertyName];
  if (!prop) return undefined;
  if (prop.type === 'status' && prop.status) return prop.status.name;
  if (prop.type === 'select' && prop.select) return prop.select.name;
  if (prop.type === 'multi_select' && Array.isArray(prop.multi_select) && prop.multi_select[0]) {
    return prop.multi_select[0].name;
  }
  return undefined;
}

function extractAssignees(page: any, propertyName?: string) {
  if (!propertyName) return undefined;
  const prop = page?.properties?.[propertyName];
  if (prop?.type === 'people' && Array.isArray(prop.people)) {
    const people = prop.people
      .map((person: any) => person?.name || person?.person?.email || person?.id)
      .filter(Boolean);
    return people.length ? people : undefined;
  }
  return undefined;
}

export function notionTaskDigestForDay(
  moduleRef: ModuleRef,
): Tool<NotionTaskDigestArgs, NotionTaskDigestResult> {
  return {
    name: 'notion.taskDigest.forDay',
    description: 'Query a Notion tasks database and summarize tasks due today (with optional overdue items).',
    in: NotionTaskDigestIn,
    out: NotionTaskDigestOut,
    apps: ['notion-productivity'],
    scopes: [],
    rate: '45/m',
    risk: 'low',
    async call(args, ctx: RunCtx) {
      const input = NotionTaskDigestIn.parse(args);
      const svc = getNotionSvc(moduleRef);
      const auth = getNotionAuthFromCtx(ctx);
      let filter = input.filter;
      if (!filter) {
        const equalsFilter = {
          property: input.datePropertyName || 'Due',
          date: { equals: input.date },
        };
        if (input.includeOverdue) {
          filter = {
            or: [
              equalsFilter,
              { property: input.datePropertyName || 'Due', date: { before: input.date } },
            ],
          };
        } else {
          filter = equalsFilter;
        }
      }
      const res = await svc.queryDatabase(
        {
          databaseId: input.databaseId,
          filter,
          sorts: input.sorts,
          pageSize: input.limit,
        },
        auth,
      );
      const results: any[] = Array.isArray(res?.results) ? res.results : [];
      const now = Date.now();
      const tasks = results.map((page) => {
        const due = extractDate(page, input.datePropertyName || 'Due');
        const dueTime = due ? Date.parse(due) : undefined;
        const overdue = typeof dueTime === 'number' ? dueTime < now : false;
        return {
          id: page.id,
          title: extractTitle(page, input.titlePropertyName || 'Name'),
          status: extractStatus(page, input.statusPropertyName),
          assignees: extractAssignees(page, input.assigneePropertyName),
          dueDate: due,
          url: page.url,
          overdue,
        };
      });
      const overdueCount = tasks.filter((task) => task.overdue).length;
      return NotionTaskDigestOut.parse({
        total: tasks.length,
        overdueCount,
        tasks,
        nextCursor: res?.next_cursor || undefined,
      });
    },
  };
}
