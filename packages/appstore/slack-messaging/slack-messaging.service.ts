import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@quikday/prisma';
import { CurrentUserService } from '@quikday/libs';

type SlackCredential = {
  access_token?: string;
  token?: { access_token?: string };
};

@Injectable()
export class SlackMessagingService {
  private readonly logger = new Logger(SlackMessagingService.name);
  private readonly slug = 'slack-messaging';

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
    if (!cred) throw new Error('Slack credential not found');
    const key = cred.key as unknown as SlackCredential;
    const token = key?.access_token || key?.token?.access_token;
    if (!token) throw new Error('Slack access token missing in credential');
    return token;
  }

  async listChannels(input: {
    types?: string;
    limit?: number;
    cursor?: string;
    query?: string;
  }): Promise<{ channels: Array<{ id: string; name: string; is_private?: boolean; is_member?: boolean }>; nextCursor?: string }>
  {
    const token = await this.getAccessTokenForCurrentUser();
    const params = new URLSearchParams();
    params.set('types', input.types || 'public_channel,private_channel');
    if (input.limit) params.set('limit', String(input.limit));
    if (input.cursor) params.set('cursor', input.cursor);
    const resp = await fetch(`https://slack.com/api/conversations.list?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json: any = await resp.json();
    if (!json?.ok) throw new Error(`Slack API error: ${json?.error || 'unknown_error'}`);
    let channels: Array<{ id: string; name: string; is_private?: boolean; is_member?: boolean }> =
      Array.isArray(json.channels)
        ? json.channels.map((c: any) => ({
            id: String(c.id),
            name: String(c.name),
            is_private: Boolean(c.is_private),
            is_member: Boolean(c.is_member),
          }))
        : [];
    if (input.query && input.query.trim()) {
      const q = input.query.trim().toLowerCase();
      channels = channels.filter((c) => c.name.toLowerCase().includes(q));
    }
    const nextCursor: string | undefined = json?.response_metadata?.next_cursor || undefined;
    return { channels, nextCursor };
  }

  async postMessage(input: { channel: string; text: string; thread_ts?: string }): Promise<{ ok: boolean; channel: string; ts?: string; url?: string }>
  {
    const token = await this.getAccessTokenForCurrentUser();
    const channel = input.channel.startsWith('#') ? input.channel.slice(1) : input.channel;
    // Best-effort join
    try {
      await fetch('https://slack.com/api/conversations.join', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel }),
      });
    } catch (e) {
      this.logger.debug('conversations.join failed (ignored)');
    }

    const resp = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channel,
        text: input.text,
        ...(input.thread_ts ? { thread_ts: input.thread_ts } : {}),
      }),
    });
    const json: any = await resp.json();
    if (!json?.ok) throw new Error(`Slack API error: ${json?.error || 'unknown_error'}`);
    return { ok: true, channel: json.channel || channel, ts: json.ts, url: undefined };
  }
}

