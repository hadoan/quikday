import { ModuleRef } from '@nestjs/core';
import type { RunCtx } from '../../../state/types.js';
import { NotionProductivityService } from '@quikday/appstore-notion-productivity';

export type NotionAuthOptions = {
  credentialKey?: Record<string, unknown> | null;
  tokenExpiresAt?: string | number | Date | null;
  accessToken?: string | null;
};

export function getNotionSvc(moduleRef: ModuleRef): NotionProductivityService {
  return moduleRef.get(NotionProductivityService, { strict: false }) as NotionProductivityService;
}

export function getNotionAuthFromCtx(ctx: RunCtx): NotionAuthOptions {
  const credentialMeta = ctx?.currentTool?.credential ?? null;
  const credentialKey =
    credentialMeta &&
    credentialMeta.key &&
    typeof credentialMeta.key === 'object' &&
    !Array.isArray(credentialMeta.key)
      ? (credentialMeta.key as Record<string, unknown>)
      : null;
  const accessToken =
    typeof (credentialMeta as any)?.accessToken === 'string'
      ? ((credentialMeta as any).accessToken as string)
      : null;
  const tokenExpiresAt = credentialMeta?.tokenExpiresAt ?? null;
  return { credentialKey, tokenExpiresAt, accessToken };
}

const MAX_TEXT_LENGTH = 1900;

export function notionText(content: string) {
  const trimmed = (content ?? '').toString().trim();
  return [
    {
      type: 'text',
      text: { content: trimmed.slice(0, MAX_TEXT_LENGTH) },
    },
  ];
}

export function titleProperty(title: string) {
  return {
    title: notionText(title),
  };
}

export function headingBlock(text: string, level: 1 | 2 | 3 = 2) {
  const key = (`heading_${level}`) as 'heading_1' | 'heading_2' | 'heading_3';
  return {
    object: 'block',
    type: key,
    [key]: {
      rich_text: notionText(text),
      color: 'default',
    },
  };
}

export function paragraphBlock(text: string) {
  return {
    object: 'block',
    type: 'paragraph',
    paragraph: {
      rich_text: notionText(text),
      color: 'default',
    },
  };
}

export function bulletedListBlocks(items: string[]) {
  const blocks: any[] = [];
  for (const item of items || []) {
    const text = (item ?? '').toString().trim();
    if (!text) continue;
    blocks.push({
      object: 'block',
      type: 'bulleted_list_item',
      bulleted_list_item: {
        rich_text: notionText(text),
        color: 'default',
      },
    });
  }
  return blocks;
}

export function keyValueBlocks(pairs: Array<{ label: string; value?: string }>) {
  const blocks: any[] = [];
  for (const pair of pairs || []) {
    const label = (pair?.label ?? '').trim();
    const value = (pair?.value ?? '').trim();
    if (!label && !value) continue;
    const text = label && value ? `${label}: ${value}` : label || value;
    blocks.push(paragraphBlock(text));
  }
  return blocks;
}

export function checklistBlocks(items: string[]) {
  const blocks: any[] = [];
  for (const item of items || []) {
    const text = (item ?? '').toString().trim();
    if (!text) continue;
    blocks.push({
      object: 'block',
      type: 'to_do',
      to_do: {
        checked: false,
        rich_text: notionText(text),
        color: 'default',
      },
    });
  }
  return blocks;
}

export type SimpleSection = {
  title: string;
  body?: string;
  bullets?: string[];
  keyValues?: Array<{ label: string; value?: string }>;
};

export function buildSections(sections: SimpleSection[]) {
  const blocks: any[] = [];
  for (const section of sections || []) {
    if (section.title) {
      blocks.push(headingBlock(section.title, 3));
    }
    if (section.body) {
      blocks.push(paragraphBlock(section.body));
    }
    if (section.keyValues) {
      blocks.push(...keyValueBlocks(section.keyValues));
    }
    if (section.bullets) {
      blocks.push(...bulletedListBlocks(section.bullets));
    }
  }
  return blocks;
}

export async function upsertPageWithContent(
  svc: NotionProductivityService,
  auth: NotionAuthOptions,
  input: {
    pageId?: string;
    databaseId?: string;
    parentPageId?: string;
    properties: Record<string, any>;
    children?: any[];
  },
) {
  if (input.pageId) {
    const res = await svc.updatePage(
      {
        pageId: input.pageId,
        properties: input.properties,
      },
      auth,
    );
    if (input.children && input.children.length) {
      await svc.replaceBlocks(
        {
          blockId: input.pageId,
          children: input.children,
        },
        auth,
      );
    }
    return res;
  }

  if (!input.databaseId && !input.parentPageId) {
    throw new Error('databaseId or parentPageId is required');
  }

  return svc.createPage(
    {
      databaseId: input.databaseId,
      parentPageId: input.parentPageId,
      properties: input.properties,
      children: input.children,
    },
    auth,
  );
}
