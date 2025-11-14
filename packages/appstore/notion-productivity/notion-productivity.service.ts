import { Injectable } from '@nestjs/common';
import { PrismaService } from '@quikday/prisma';
import { CurrentUserService } from '@quikday/libs';

type NotionCredential = {
  access_token?: string;
};

@Injectable()
export class NotionProductivityService {
  private readonly slug = 'notion-productivity';
  private readonly apiVersion = '2022-06-28';

  constructor(
    private readonly prisma: PrismaService,
    private readonly currentUser?: CurrentUserService,
  ) {}

  private async getAccessTokenForCurrentUser(): Promise<string> {
    const sub = this.currentUser?.getCurrentUserSub?.();
    if (!sub) throw new Error('Not authenticated');
    const user = await this.prisma.user.findUnique({ where: { sub } });
    if (!user) throw new Error('User not found');

    const cred = await this.prisma.credential.findFirst({
      where: { userId: user.id, invalid: false, appId: this.slug },
      orderBy: { updatedAt: 'desc' },
    });
    if (!cred) throw new Error('Notion credential not found');
    const key = cred.key as unknown as NotionCredential;
    const token = key?.access_token;
    if (!token) throw new Error('Notion access token missing in credential');
    return token;
  }

  async createPage(input: {
    databaseId: string;
    properties: Record<string, any>;
    children?: any[];
  }): Promise<any> {
    const token = await this.getAccessTokenForCurrentUser();
    const resp = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Notion-Version': this.apiVersion,
      },
      body: JSON.stringify({
        parent: { database_id: input.databaseId },
        properties: input.properties,
        ...(input.children ? { children: input.children } : {}),
      }),
    });
    const json = await resp.json();
    if (!resp.ok) {
      const error = (json as any)?.message || 'unknown_error';
      throw new Error(`Notion API error: ${error}`);
    }
    return json;
  }

  async updatePage(input: { pageId: string; properties: Record<string, any> }): Promise<any> {
    const token = await this.getAccessTokenForCurrentUser();
    const resp = await fetch(`https://api.notion.com/v1/pages/${input.pageId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Notion-Version': this.apiVersion,
      },
      body: JSON.stringify({ properties: input.properties }),
    });
    const json = await resp.json();
    if (!resp.ok) {
      const error = (json as any)?.message || 'unknown_error';
      throw new Error(`Notion API error: ${error}`);
    }
    return json;
  }

  async addTodo(input: {
    pageId: string;
    text: string;
    checked?: boolean;
    children?: any[];
  }): Promise<any> {
    const token = await this.getAccessTokenForCurrentUser();
    const richText = [
      {
        type: 'text',
        text: { content: input.text },
      },
    ];
    const body = {
      children: [
        {
          object: 'block',
          type: 'to_do',
          to_do: {
            rich_text: richText,
            checked: Boolean(input.checked),
            color: 'default',
            ...(input.children ? { children: input.children } : {}),
          },
        },
      ],
    };
    const resp = await fetch(`https://api.notion.com/v1/blocks/${input.pageId}/children`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Notion-Version': this.apiVersion,
      },
      body: JSON.stringify(body),
    });
    const json = await resp.json();
    if (!resp.ok) {
      const error = (json as any)?.message || 'unknown_error';
      throw new Error(`Notion API error: ${error}`);
    }
    return json;
  }

  async listTodos(input: { pageId: string; limit?: number; recursive?: boolean }): Promise<{
    items: Array<{ id: string; text: string; checked?: boolean }>;
    nextCursor?: string;
  }> {
    const token = await this.getAccessTokenForCurrentUser();
    const items: Array<{ id: string; text: string; checked?: boolean }> = [];
    let cursor: string | undefined = undefined;
    const limit = input.limit && input.limit > 0 ? input.limit : undefined;

    const fetchOnce = async () => {
      const url = new URL(`https://api.notion.com/v1/blocks/${input.pageId}/children`);
      if (cursor) url.searchParams.set('start_cursor', cursor);
      const resp = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${token}`, 'Notion-Version': this.apiVersion },
      });
      const json: any = await resp.json();
      if (!resp.ok) {
        const error = (json as any)?.message || 'unknown_error';
        throw new Error(`Notion API error: ${error}`);
      }
      const results: any[] = Array.isArray(json.results) ? json.results : [];
      for (const b of results) {
        if (b?.type === 'to_do') {
          const texts = Array.isArray(b.to_do?.rich_text) ? b.to_do.rich_text : [];
          const text = texts.map((t: any) => t?.plain_text || t?.text?.content || '').join('');
          items.push({ id: b.id, text, checked: Boolean(b.to_do?.checked) });
          if (limit && items.length >= limit) break;
        }
        if (input.recursive && b?.has_children && (!limit || items.length < limit)) {
          try {
            const child = await this.listTodos({ pageId: b.id, limit: limit ? limit - items.length : undefined, recursive: true });
            for (const it of child.items) {
              items.push(it);
              if (limit && items.length >= limit) break;
            }
          } catch {
            // ignore child errors
          }
        }
        if (limit && items.length >= limit) break;
      }
      cursor = json?.next_cursor || undefined;
      return json?.has_more === true;
    };

    let hasMore = true;
    while (hasMore && (!limit || items.length < limit)) {
      hasMore = await fetchOnce();
    }

    return { items, nextCursor: cursor };
  }

  async toggleTodo(input: { blockId: string; checked: boolean }): Promise<any> {
    const token = await this.getAccessTokenForCurrentUser();
    const resp = await fetch(`https://api.notion.com/v1/blocks/${input.blockId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Notion-Version': this.apiVersion,
      },
      body: JSON.stringify({ to_do: { checked: Boolean(input.checked) } }),
    });
    const json = await resp.json();
    if (!resp.ok) {
      const error = (json as any)?.message || 'unknown_error';
      throw new Error(`Notion API error: ${error}`);
    }
    return json;
  }

  async updateTodo(input: { blockId: string; text?: string; checked?: boolean }): Promise<any> {
    const token = await this.getAccessTokenForCurrentUser();
    const body: any = { to_do: {} };
    if (typeof input.checked === 'boolean') body.to_do.checked = input.checked;
    if (typeof input.text === 'string') {
      body.to_do.rich_text = [
        {
          type: 'text',
          text: { content: input.text },
        },
      ];
    }
    const resp = await fetch(`https://api.notion.com/v1/blocks/${input.blockId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Notion-Version': this.apiVersion,
      },
      body: JSON.stringify(body),
    });
    const json = await resp.json();
    if (!resp.ok) {
      const error = (json as any)?.message || 'unknown_error';
      throw new Error(`Notion API error: ${error}`);
    }
    return json;
  }

  async listPages(input?: {
    query?: string;
    limit?: number;
    cursor?: string;
  }): Promise<{ items: Array<{ id: string; title: string; icon?: string | null }>; nextCursor?: string }> {
    const token = await this.getAccessTokenForCurrentUser();
    const pageSize = Math.min(Math.max(input?.limit ?? 50, 1), 100);
    const body: Record<string, any> = {
      page_size: pageSize,
      sort: { direction: 'descending', timestamp: 'last_edited_time' },
      filter: { property: 'object', value: 'page' },
    };
    if (input?.query) body.query = input.query;
    if (input?.cursor) body.start_cursor = input.cursor;

    const resp = await fetch('https://api.notion.com/v1/search', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Notion-Version': this.apiVersion,
      },
      body: JSON.stringify(body),
    });
    const json: any = await resp.json();
    if (!resp.ok) {
      const error = (json as any)?.message || 'unknown_error';
      throw new Error(`Notion API error: ${error}`);
    }

    const items: Array<{ id: string; title: string; icon?: string | null }> = [];
    const results: any[] = Array.isArray(json.results) ? json.results : [];
    for (const page of results) {
      if (!page || page.object !== 'page') continue;
      const props = page.properties || {};
      let title = '';
      for (const value of Object.values(props)) {
        const prop = value as any;
        if (prop?.type === 'title' && Array.isArray(prop?.title)) {
          title = prop.title
            .map((t: any) => t?.plain_text || t?.text?.content || '')
            .join('')
            .trim();
          if (title) break;
        }
      }
      if (!title && Array.isArray(page?.title)) {
        title = page.title.map((t: any) => t?.plain_text || '').join('').trim();
      }
      if (!title) title = 'Untitled page';
      const icon =
        page?.icon?.emoji || page?.icon?.external?.url || page?.icon?.file?.url || null;
      items.push({ id: page.id, title, icon });
    }

    return { items, nextCursor: json?.next_cursor || undefined };
  }
}
