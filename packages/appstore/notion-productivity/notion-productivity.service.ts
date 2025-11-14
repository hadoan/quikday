import { Injectable } from '@nestjs/common';
import { PrismaService } from '@quikday/prisma';
import { CurrentUserService } from '@quikday/libs';

export type NotionCredential = Record<string, unknown>;

export type AccessTokenOptions = {
  accessToken?: string | null;
  credentialKey?: Record<string, unknown> | null;
  tokenExpiresAt?: string | number | Date | null;
  refresh?: () =>
    | Promise<string>
    | Promise<{ accessToken: string; tokenExpiresAt?: string | number | Date | null }>;
};

@Injectable()
export class NotionProductivityService {
  private readonly slug = 'notion-productivity';
  private readonly apiVersion = '2022-06-28';

  constructor(
    private readonly prisma: PrismaService,
    private readonly currentUser: CurrentUserService,
  ) {}

  private async getAccessTokenForCurrentUser(): Promise<string> {
    const sub = this.currentUser.getCurrentUserSub();
    if (!sub) throw new Error('Not authenticated');
    const user = await this.prisma.user.findUnique({ where: { sub } });
    if (!user) throw new Error('User not found');

    const cred = await this.prisma.credential.findFirst({
      where: { userId: user.id, invalid: false, appId: this.slug },
      orderBy: { updatedAt: 'desc' },
    });
    if (!cred) throw new Error('Notion credential not found');
    const key = cred.key as unknown as NotionCredential;
    const token =
      key && typeof key === 'object' && 'access_token' in key && typeof (key as any).access_token === 'string'
        ? ((key as any).access_token as string)
        : undefined;
    if (!token) throw new Error('Notion access token missing in credential');
    return token;
  }

  private parseExpiresAt(source: string | number | Date | null | undefined): number | undefined {
    if (!source) return undefined;
    if (source instanceof Date) return source.getTime();
    if (typeof source === 'number') {
      return source > 10_000_000_000 ? source : source * 1000;
    }
    if (typeof source === 'string') {
      const trimmed = source.trim();
      if (!trimmed) return undefined;
      const numeric = Number(trimmed);
      if (!Number.isNaN(numeric)) {
        return numeric > 10_000_000_000 ? numeric : numeric * 1000;
      }
      const parsed = Date.parse(trimmed);
      return Number.isNaN(parsed) ? undefined : parsed;
    }
    return undefined;
  }

  private extractAccessTokenFromKey(key?: Record<string, unknown> | null): string | null {
    if (!key || typeof key !== 'object') return null;
    const candidates = ['access_token', 'accessToken', 'token', 'bearer'];
    for (const candidate of candidates) {
      const value = (key as Record<string, unknown>)[candidate];
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }
    return null;
  }

  private extractExpiryFromKey(key?: Record<string, unknown> | null): number | undefined {
    if (!key || typeof key !== 'object') return undefined;
    const candidates = [
      'expiry_date',
      'expires_at',
      'expiresAt',
      'expiration',
      'tokenExpiresAt',
      'access_token_expires_at',
    ];
    for (const candidate of candidates) {
      const value = (key as Record<string, unknown>)[candidate];
      const parsed = this.parseExpiresAt(
        (typeof value === 'object' && value && 'value' in (value as any)
          ? ((value as any).value as any)
          : value) as any,
      );
      if (parsed) return parsed;
    }
    return undefined;
  }

  private shouldRefresh(expiresAt?: number): boolean {
    if (!expiresAt) return false;
    const safetyWindowMs = 60_000; // refresh 1 minute before expiry
    return expiresAt - safetyWindowMs <= Date.now();
  }

  private async resolveAccessToken(opts?: AccessTokenOptions): Promise<string> {
    const candidate =
      typeof opts?.accessToken === 'string' && opts.accessToken.trim()
        ? opts.accessToken.trim()
        : this.extractAccessTokenFromKey(opts?.credentialKey);

    const expiresAt =
      this.parseExpiresAt(opts?.tokenExpiresAt ?? null) ??
      this.extractExpiryFromKey(opts?.credentialKey);

    if (candidate && !this.shouldRefresh(expiresAt)) {
      return candidate;
    }

    if (typeof opts?.refresh === 'function') {
      const refreshed = await opts.refresh();
      if (typeof refreshed === 'string' && refreshed.trim()) {
        return refreshed.trim();
      }
      if (refreshed && typeof refreshed === 'object') {
        const refreshedToken = (refreshed as any).accessToken;
        if (typeof refreshedToken === 'string' && refreshedToken.trim()) {
          return refreshedToken.trim();
        }
      }
    }

    if (candidate) {
      // Candidate exists but is considered expired or refresh handler missing.
      // Fallback to DB in case the stored credential has been renewed.
      const fresh = await this.getAccessTokenForCurrentUser();
      return fresh;
    }

    return this.getAccessTokenForCurrentUser();
  }

  async createPage(
    input: {
      databaseId: string;
      properties: Record<string, any>;
      children?: any[];
    },
    opts?: AccessTokenOptions,
  ): Promise<any> {
    const token = await this.resolveAccessToken(opts);
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

  async updatePage(
    input: { pageId: string; properties: Record<string, any> },
    opts?: AccessTokenOptions,
  ): Promise<any> {
    const token = await this.resolveAccessToken(opts);
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

  async addTodo(
    input: {
      pageId: string;
      text: string;
      checked?: boolean;
      children?: any[];
    },
    opts?: AccessTokenOptions,
  ): Promise<any> {
    const token = await this.resolveAccessToken(opts);
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

  async listTodos(
    input: { pageId: string; limit?: number; recursive?: boolean },
    opts?: AccessTokenOptions,
  ): Promise<{
    items: Array<{ id: string; text: string; checked?: boolean }>;
    nextCursor?: string;
  }> {
    const token = await this.resolveAccessToken(opts);
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
            const child = await this.listTodos(
              { pageId: b.id, limit: limit ? limit - items.length : undefined, recursive: true },
              { ...opts, accessToken: token },
            );
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

  async toggleTodo(
    input: { blockId: string; checked: boolean },
    opts?: AccessTokenOptions,
  ): Promise<any> {
    const token = await this.resolveAccessToken(opts);
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

  async updateTodo(
    input: { blockId: string; text?: string; checked?: boolean },
    opts?: AccessTokenOptions,
  ): Promise<any> {
    const token = await this.resolveAccessToken(opts);
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

  async listPages(
    input?: {
      query?: string;
      limit?: number;
      cursor?: string;
    },
    opts?: AccessTokenOptions,
  ): Promise<{ items: Array<{ id: string; title: string; icon?: string | null }>; nextCursor?: string }> {
    const token = await this.resolveAccessToken(opts);
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
