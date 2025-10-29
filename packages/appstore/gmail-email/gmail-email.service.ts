import { URLSearchParams } from 'url';
import { randomUUID } from 'crypto';
import type { EmailService } from '@quikday/appstore/email/email.service';
import type {
  ProviderCapabilities,
  EmailMessage,
  SearchQuery,
  DraftInput,
  SendOptions,
  LabelChange,
  EmailAddress,
} from '@quikday/appstore/email/email.types';
import { CurrentUserService } from '@quikday/libs';
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@quikday/prisma';
import { google, gmail_v1 } from 'googleapis';
import { getAppKeysFromSlug } from '@quikday/appstore';

@Injectable()
export class GmailEmailService implements EmailService {
  readonly provider = 'gmail' as const;
  private readonly logger = new Logger('GmailEmailService');

  constructor(
    private currentUserService: CurrentUserService,
    private prismaService: PrismaService,
  ) {
    // conn.accessToken / refreshToken used by an internal Gmail client
  }

  getCapabilities(): ProviderCapabilities {
    return { scheduleSend: true, snooze: true, labels: true, threads: true };
  }

  async getThread(threadId: string): Promise<EmailMessage[]> {
    this.logger.log(this.formatMeta({ op: 'getThread', threadId }));
    const { gmail } = await this.getGmailClient();
    const resp = await gmail.users.threads.get({ userId: 'me', id: threadId, format: 'full' });
    const data: any = resp.data;
    const messages: any[] = Array.isArray(data?.messages) ? data.messages : [];
    return messages.map((m) => this.mapGmailMessageToEmailMessage(m));
  }

  async getMessage(messageId: string): Promise<EmailMessage> {
    this.logger.log(this.formatMeta({ op: 'getMessage', messageId }));
    const { gmail } = await this.getGmailClient();
    const resp = await gmail.users.messages.get({ userId: 'me', id: messageId, format: 'full' });
    return this.mapGmailMessageToEmailMessage(resp.data as any);
  }

  async search(q: SearchQuery) {
    this.logger.log(this.formatMeta({ op: 'search', query: q }));
    const { gmail } = await this.getGmailClient();

    const terms: string[] = [];
    if (q.text) terms.push(q.text);
    if (q.from) terms.push(`from:${q.from}`);
    if (q.to) terms.push(`to:${q.to}`);
    if (q.label) terms.push(`label:${q.label}`);
    if (q.newerThan) terms.push(`after:${this.formatGmailDate(q.newerThan)}`);
    if (q.olderThan) terms.push(`before:${this.formatGmailDate(q.olderThan)}`);
    const query = terms.join(' ').trim();

    const params = new URLSearchParams();
    if (query) params.set('q', query);
    if (q.limit && q.limit > 0) params.set('maxResults', String(q.limit));
    if (q.pageToken) params.set('pageToken', q.pageToken);
    params.set('format', 'metadata');
    params.append('metadataHeaders', 'Subject');
    params.append('metadataHeaders', 'From');
    params.append('metadataHeaders', 'To');
    params.append('metadataHeaders', 'Date');

    const resp = await gmail.users.messages.list({
      userId: 'me',
      q: query || undefined,
      maxResults: q.limit && q.limit > 0 ? q.limit : undefined,
      pageToken: q.pageToken || undefined,
    });
    const listing: any = resp.data;
    const items: any[] = Array.isArray(listing?.messages) ? listing.messages : [];

    // Fetch details for each message in parallel (metadata is sometimes enough, but we map uniformly)
    const results: EmailMessage[] = await Promise.all(
      items.map(async (it) => {
        try {
          const r = await gmail.users.messages.get({ userId: 'me', id: it.id, format: 'full' });
          return this.mapGmailMessageToEmailMessage(r.data as any);
        } catch {
          this.logger.warn(this.formatMeta({ op: 'searchHydrateFailed', id: it?.id }));
          return null;
        }
      }),
    ).then((arr) => arr.filter((x): x is EmailMessage => !!x));

    return {
      messages: results,
      nextPageToken: typeof listing?.nextPageToken === 'string' ? listing.nextPageToken : undefined,
    };
  }

  async createDraft(draft: DraftInput) {
    this.logger.log(
      this.formatMeta({
        op: 'createDraft',
        toCount: draft.to?.length ?? 0,
        subject: draft.subject,
      }),
    );
    const { gmail, email } = await this.getGmailClient();

    const fromAddress = draft.from?.address || email || 'unknown@gmail.com';
    const fromName = draft.from?.name;
    const to = this.mapAddresses(draft.to);
    const cc = this.mapAddresses(draft.cc ?? []);
    const bcc = this.mapAddresses(draft.bcc ?? []);
    if (to.length === 0) throw new Error('At least one recipient is required');

    const htmlBody =
      draft.html && draft.html.trim().length > 0
        ? draft.html
        : (draft.text ?? '').replace(/\n/g, '<br>');

    const rawMessage = this.createRawMimeMessage({
      from: fromAddress,
      to,
      subject: draft.subject,
      htmlBody,
      cc,
      bcc,
      fromName,
      replyToMessageId: draft.replyToMessageId,
    });

    const resp = await gmail.users.drafts.create({
      userId: 'me',
      requestBody: { message: { raw: rawMessage } },
    });
    const data: any = resp.data;
    const draftId = typeof data?.id === 'string' ? data.id : '';
    const threadId =
      typeof data?.message?.threadId === 'string' ? data.message.threadId : undefined;
    this.logger.log(this.formatMeta({ op: 'createDraft.done', draftId, threadId }));
    return { draftId, threadId };
  }

  async send(draft: DraftInput, opts?: SendOptions) {
    const currentUserId = this.currentUserService.getCurrentUserId();
    if (!currentUserId) throw new Error('No current user in context');

    // Resolve numeric userId: if currentUserId is a non-numeric string, treat as external "sub"
    // and look up the local User first. Otherwise, parse numeric id directly.
    let userId: number | null = null;
    if (/^\d+$/.test(currentUserId)) {
      userId = Number(currentUserId);
    } else {
      const user = await this.prismaService.user.findUnique({ where: { sub: currentUserId } });
      if (!user) throw new Error('User not found for provided subject');
      userId = user.id;
    }
    if (!Number.isFinite(userId)) throw new Error('Invalid current user id');

    // Resolve latest valid Gmail credential for user
    const credential = await this.prismaService.credential.findFirst({
      where: { userId, appId: 'gmail-email', invalid: false },
      orderBy: { createdAt: 'desc' },
    });

    if (!credential) {
      throw new Error('No Gmail integration found. Connect a Gmail account first.');
    }

    const key = this.safeCredentialKey(credential.key as any);
    let accessToken =
      this.getStringField(key, 'access_token') ?? this.getStringField(key, 'accessToken');
    const refreshToken =
      this.getStringField(key, 'refresh_token') ?? this.getStringField(key, 'refreshToken');
    const expiresAt = this.resolveExpiresAt(credential.tokenExpiresAt, key);

    if (!accessToken) {
      throw new Error('Gmail access token missing. Reconnect your Gmail account.');
    }

    if (this.isTokenExpired(expiresAt)) {
      accessToken = await this.refreshAccessToken(credential.id, refreshToken);
    }

    const fromAddress =
      (typeof credential.emailOrUserName === 'string' && credential.emailOrUserName) ||
      draft.from?.address ||
      'unknown@gmail.com';
    const fromName = draft.from?.name;
    const to = this.mapAddresses(draft.to);
    const cc = this.mapAddresses(draft.cc ?? []);
    const bcc = this.mapAddresses(draft.bcc ?? []);

    if (to.length === 0) {
      throw new Error('At least one recipient is required');
    }
    const invalid = [...to, ...cc, ...bcc].filter((addr) => !this.isValidEmail(addr));
    if (invalid.length > 0) {
      throw new Error(`Invalid email address found: ${invalid.join(', ')}`);
    }

    const htmlBody =
      draft.html && draft.html.trim().length > 0
        ? draft.html
        : (draft.text ?? '').replace(/\n/g, '<br>');

    const rawMessage = this.createRawMimeMessage({
      from: fromAddress,
      to,
      subject: draft.subject,
      htmlBody,
      cc,
      bcc,
      fromName,
      replyToMessageId: draft.replyToMessageId,
    });

    const res = await this.sendEmailViaGmailApi('me', rawMessage, accessToken);
    return { messageId: res.messageId ?? '', threadId: res.threadId ?? '' };
  }

  async sendExistingDraft(draftId: string, opts?: SendOptions) {
    this.logger.log(this.formatMeta({ op: 'sendExistingDraft', draftId }));
    const { gmail } = await this.getGmailClient();
    const resp = await gmail.users.drafts.send({ userId: 'me', requestBody: { id: draftId } });
    const data: any = resp.data;
    return {
      messageId: typeof data?.id === 'string' ? data.id : '',
      threadId: typeof data?.threadId === 'string' ? data.threadId : '',
    };
  }

  async changeLabels(target: { threadId?: string; messageId?: string }, delta: LabelChange) {
    this.logger.log(this.formatMeta({ op: 'changeLabels', target, delta }));
    const { gmail } = await this.getGmailClient();
    const { add = [], remove = [] } = delta || {};

    const { idMap, nameMap } = await this.fetchLabelsMap();
    const toIds = (names: string[]) =>
      names
        .map((n) => idMap.get(n) || nameMap.get(n) || n)
        .filter((x): x is string => typeof x === 'string' && x.length > 0);

    const addLabelIds = toIds(add);
    const removeLabelIds = toIds(remove);

    if (target.threadId) {
      await gmail.users.threads.modify({
        userId: 'me',
        id: target.threadId,
        requestBody: { addLabelIds, removeLabelIds },
      });
      return;
    }

    if (target.messageId) {
      await gmail.users.messages.modify({
        userId: 'me',
        id: target.messageId,
        requestBody: { addLabelIds, removeLabelIds },
      });
      return;
    }

    throw new Error('Either threadId or messageId is required to change labels');
  }

  async archive(target: { threadId?: string; messageId?: string }) {
    this.logger.log(this.formatMeta({ op: 'archive', target }));
    return this.changeLabels(target, { remove: ['INBOX'] });
  }

  async snooze(target: { threadId?: string; messageId?: string }, until: Date) {
    this.logger.log(this.formatMeta({ op: 'snooze', target, until }));
    // Minimal implementation: add SNOOZED, remove INBOX
    await this.changeLabels(target, { add: ['SNOOZED'], remove: ['INBOX'] });
  }

  // ===== Helpers (ported from GmailManager) =====
  private mapAddresses(addrs: EmailAddress[]): string[] {
    return (addrs ?? [])
      .map((a) => a?.address)
      .filter((x): x is string => typeof x === 'string' && x.length > 0);
  }

  private isValidEmail(email: string): boolean {
    const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
    return EMAIL_REGEX.test(email);
  }

  private safeCredentialKey(key: Record<string, unknown> | null | undefined): CredentialKey {
    if (key && typeof key === 'object' && !Array.isArray(key)) return key as CredentialKey;
    return {} as CredentialKey;
  }

  private resolveExpiresAt(storedExpiresAt: Date | null, key: CredentialKey): Date | undefined {
    if (storedExpiresAt) return storedExpiresAt;
    const expiresAtStr = this.getStringField(key, 'expires_at');
    if (expiresAtStr) {
      const parsed = new Date(expiresAtStr);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }
    const expiryDate = this.getNumberField(key, 'expiry_date');
    if (typeof expiryDate === 'number' && !Number.isNaN(expiryDate)) {
      const date = new Date(expiryDate);
      if (!Number.isNaN(date.getTime())) return date;
    }
    return undefined;
  }

  private getStringField(source: Record<string, unknown>, field: string): string | undefined {
    const value = source[field];
    return typeof value === 'string' ? value : undefined;
  }

  private getNumberField(source: Record<string, unknown>, field: string): number | undefined {
    const value = source[field];
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      const parsed = Number(value);
      return Number.isNaN(parsed) ? undefined : parsed;
    }
    return undefined;
  }

  private isTokenExpired(expiresAt?: Date | null): boolean {
    if (!expiresAt) return true;
    const bufferMs = 5 * 60 * 1000;
    return Date.now() >= expiresAt.getTime() - bufferMs;
  }

  private async resolveAccessContext(): Promise<{
    accessToken: string;
    refreshToken?: string | null;
    expiresAt?: Date;
    credentialId: number;
    email?: string;
  }> {
    const currentUserId = this.currentUserService.getCurrentUserId();
    if (!currentUserId) throw new Error('No current user in context');

    let userId: number | null = null;
    if (/^\d+$/.test(currentUserId)) {
      userId = Number(currentUserId);
    } else {
      const user = await this.prismaService.user.findUnique({ where: { sub: currentUserId } });
      if (!user) throw new Error('User not found for provided subject');
      userId = user.id;
    }
    if (!Number.isFinite(userId)) throw new Error('Invalid current user id');

    const credential = await this.prismaService.credential.findFirst({
      where: { userId, appId: 'gmail-email', invalid: false },
      orderBy: { createdAt: 'desc' },
    });
    if (!credential) throw new Error('No Gmail integration found. Connect a Gmail account first.');

    const key = this.safeCredentialKey(credential.key as any);
    let accessToken =
      this.getStringField(key, 'access_token') ?? this.getStringField(key, 'accessToken');
    const refreshToken =
      this.getStringField(key, 'refresh_token') ?? this.getStringField(key, 'refreshToken');
    const expiresAt = this.resolveExpiresAt(credential.tokenExpiresAt, key);
    if (!accessToken) throw new Error('Gmail access token missing. Reconnect your Gmail account.');
    if (this.isTokenExpired(expiresAt)) {
      accessToken = await this.refreshAccessToken(credential.id, refreshToken);
    }
    const email =
      typeof credential.emailOrUserName === 'string' && credential.emailOrUserName.length > 0
        ? credential.emailOrUserName
        : undefined;
    return { accessToken, refreshToken, expiresAt, credentialId: credential.id, email };
  }

  private async getGmailClient(): Promise<{
    gmail: gmail_v1.Gmail;
    credentialId: number;
    email?: string;
  }> {
    const { accessToken, refreshToken, expiresAt, credentialId, email } =
      await this.resolveAccessContext();
    const { clientId, clientSecret } = await this.getOAuthCredentials();
    const oAuth2 = new google.auth.OAuth2(clientId, clientSecret);
    oAuth2.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken ?? undefined,
      expiry_date: expiresAt?.getTime(),
    });

    // Persist refreshed tokens if the client refreshes automatically
    oAuth2.on('tokens', async (tokens) => {
      try {
        const cred = await this.prismaService.credential.findUnique({
          where: { id: credentialId },
        });
        const oldKey = this.safeCredentialKey(cred?.key as any);
        const updatedKey: CredentialKey = { ...oldKey };
        if (tokens.access_token) updatedKey.access_token = tokens.access_token;
        if (tokens.refresh_token) updatedKey.refresh_token = tokens.refresh_token;
        let newExpiresAt: Date | undefined;
        if (typeof tokens.expiry_date === 'number') {
          newExpiresAt = new Date(tokens.expiry_date);
          updatedKey.expires_at = newExpiresAt.toISOString();
        }
        await this.prismaService.credential.update({
          where: { id: credentialId },
          data: { key: updatedKey as any, tokenExpiresAt: newExpiresAt },
        });
      } catch {
        // ignore background persist errors
      }
    });

    const gmail = google.gmail({ version: 'v1', auth: oAuth2 });
    return { gmail, credentialId, email };
  }

  private async getOAuthCredentials(): Promise<OAuthCredentials> {
    let clientId = process.env.GMAIL_CLIENT_ID;
    let clientSecret = process.env.GMAIL_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      try {
        const appKeys = (await getAppKeysFromSlug(
          this.prismaService as any,
          'gmail-email',
        )) as Record<string, unknown>;
        if (!clientId && typeof appKeys?.client_id === 'string')
          clientId = appKeys.client_id as string;
        if (!clientSecret && typeof appKeys?.client_secret === 'string')
          clientSecret = appKeys.client_secret as string;
      } catch (_) {
        // ignore
      }
    }

    if (!clientId || !clientSecret) {
      throw new Error('Gmail OAuth configuration not found. Provide clientId and clientSecret.');
    }

    this.logger.debug?.(
      this.formatMeta({
        op: 'getOAuthCredentials',
        clientIdPresent: !!clientId,
        clientSecretPresent: !!clientSecret,
      }),
    );
    return { clientId, clientSecret };
  }

  private async refreshAccessToken(
    credentialId: number,
    refreshToken?: string | null,
  ): Promise<string> {
    this.logger.log(this.formatMeta({ op: 'refreshAccessToken', credentialId }));
    if (!refreshToken) {
      // fetch latest credential to read refresh token
      const cred = await this.prismaService.credential.findUnique({ where: { id: credentialId } });
      if (!cred) throw new Error('Gmail credential not found. Reconnect your Gmail account.');
      const key = this.safeCredentialKey(cred.key as any);
      refreshToken =
        this.getStringField(key, 'refresh_token') ?? this.getStringField(key, 'refreshToken');
      if (!refreshToken)
        throw new Error('Gmail refresh token not found. Reconnect your Gmail account.');
    }

    const { clientId, clientSecret } = await this.getOAuthCredentials();
    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    });

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    if (!response.ok) {
      const errorContent = await response.text();
      throw new Error(`Failed to refresh Gmail access token: ${errorContent}`);
    }

    const tokenResponse = (await response.json()) as Record<string, unknown>;
    const newAccessToken = this.getStringField(tokenResponse, 'access_token');
    const expiresIn = this.getNumberField(tokenResponse, 'expires_in');
    if (!newAccessToken || typeof expiresIn !== 'number' || Number.isNaN(expiresIn)) {
      throw new Error('Invalid token response from Google');
    }

    const newExpiresAt = new Date(Date.now() + expiresIn * 1000);

    // Update credential record
    const cred = await this.prismaService.credential.findUnique({ where: { id: credentialId } });
    const oldKey = this.safeCredentialKey(cred?.key as any);
    const updatedKey: CredentialKey = {
      ...oldKey,
      access_token: newAccessToken,
      expires_at: newExpiresAt.toISOString(),
    };
    const refreshedToken = this.getStringField(tokenResponse, 'refresh_token');
    if (refreshedToken) updatedKey.refresh_token = refreshedToken;

    await this.prismaService.credential.update({
      where: { id: credentialId },
      data: { key: updatedKey as any, tokenExpiresAt: newExpiresAt },
    });

    this.logger.log(this.formatMeta({ op: 'refreshAccessToken.done', credentialId }));
    return newAccessToken;
  }

  private createRawMimeMessage(params: RawMimeParams): string {
    const { from, to, subject, htmlBody, cc = [], bcc = [], fromName, replyToMessageId } = params;
    const fromHeader = fromName ? `${fromName} <${from}>` : from;
    const lines: string[] = [];

    lines.push(`From: ${fromHeader}`);
    lines.push(`To: ${to.join(', ')}`);
    if (cc.length > 0) lines.push(`Cc: ${cc.join(', ')}`);
    if (bcc.length > 0) lines.push(`Bcc: ${bcc.join(', ')}`);
    lines.push(`Subject: ${subject}`);
    lines.push(`Date: ${new Date().toUTCString()}`);
    lines.push(`Message-ID: <${randomUUID()}@gmail.com>`);

    if (replyToMessageId) {
      lines.push(`References: <${replyToMessageId}>`);
      lines.push(`In-Reply-To: <${replyToMessageId}>`);
    }

    lines.push('MIME-Version: 1.0');
    lines.push('Content-Type: text/html; charset=utf-8');
    lines.push('Content-Transfer-Encoding: base64');
    lines.push('');

    const bodyBase64 = Buffer.from(htmlBody, 'utf8').toString('base64');
    const bodyChunks = bodyBase64.match(/.{1,76}/g) ?? [];
    lines.push(...bodyChunks);

    const message = lines.join('\r\n');
    return Buffer.from(message, 'utf8')
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/u, '');
  }

  private async sendEmailViaGmailApi(
    _userId: string,
    rawMessage: string,
    _accessToken: string,
  ): Promise<GmailSendResponse> {
    this.logger.log(this.formatMeta({ op: 'sendEmailViaGmailApi' }));
    const { gmail } = await this.getGmailClient();
    const resp = await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw: rawMessage },
    });
    const payload: any = resp.data;
    const messageId = (typeof payload?.id === 'string' ? payload.id : undefined) ?? '';
    const threadId = (typeof payload?.threadId === 'string' ? payload.threadId : undefined) ?? '';
    return { success: true, messageId, threadId };
  }

  private decodeBase64UrlSafe(base64UrlSafe: string): string {
    const base64 = base64UrlSafe.replace(/-/g, '+').replace(/_/g, '/');
    const padding = base64.length % 4;
    const padded = padding > 0 ? base64.padEnd(base64.length + (4 - padding), '=') : base64;
    return Buffer.from(padded, 'base64').toString('utf8');
  }

  private parseAddressList(value?: string): EmailAddress[] {
    if (!value) return [];
    return value
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .map((item) => {
        const m = item.match(/^(.*)\s*<([^>]+)>$/);
        if (m) {
          const name = m[1].trim().replace(/^"|"$/g, '');
          const address = m[2].trim();
          return { name: name || undefined, address } as EmailAddress;
        }
        return { address: item } as EmailAddress;
      });
  }

  private extractHeader(headers: any[], name: string): string | undefined {
    const h = headers?.find?.(
      (x: any) => typeof x?.name === 'string' && x.name.toLowerCase() === name.toLowerCase(),
    );
    return typeof h?.value === 'string' ? h.value : undefined;
  }

  private mapGmailMessageToEmailMessage(m: any): EmailMessage {
    const headers = m?.payload?.headers ?? [];
    const subject = this.extractHeader(headers, 'Subject') ?? '';
    const from = this.parseAddressList(this.extractHeader(headers, 'From'))[0] ?? { address: '' };
    const to = this.parseAddressList(this.extractHeader(headers, 'To'));
    const cc = this.parseAddressList(this.extractHeader(headers, 'Cc'));
    const bcc = this.parseAddressList(this.extractHeader(headers, 'Bcc'));
    const dateStr = this.extractHeader(headers, 'Date');
    const date = dateStr ? new Date(dateStr) : new Date();
    const snippet = typeof m?.snippet === 'string' ? m.snippet : undefined;

    // Try to extract HTML or plain text body
    let bodyHtml: string | undefined;
    let bodyText: string | undefined;
    const payload = m?.payload;
    const walkParts = (p: any) => {
      if (!p) return;
      const mimeType = p.mimeType;
      if (p.body?.data && typeof p.body.data === 'string') {
        const decoded = this.decodeBase64UrlSafe(p.body.data);
        if (mimeType === 'text/html') bodyHtml = decoded;
        if (mimeType === 'text/plain') bodyText = decoded;
      }
      const parts = Array.isArray(p.parts) ? p.parts : [];
      for (const part of parts) walkParts(part);
    };
    walkParts(payload);

    const labelIds: string[] = Array.isArray(m?.labelIds)
      ? m.labelIds.filter((x: any) => typeof x === 'string')
      : [];

    return {
      id: typeof m?.id === 'string' ? m.id : '',
      threadId: typeof m?.threadId === 'string' ? m.threadId : '',
      subject,
      from,
      to,
      cc: cc.length ? cc : undefined,
      bcc: bcc.length ? bcc : undefined,
      date,
      snippet,
      bodyHtml,
      bodyText,
      providerLabels: labelIds,
      headers: headers?.reduce?.(
        (acc: Record<string, string>, h: any) => {
          if (typeof h?.name === 'string' && typeof h?.value === 'string') acc[h.name] = h.value;
          return acc;
        },
        {} as Record<string, string>,
      ),
    } as EmailMessage;
  }

  private async fetchLabelsMap(): Promise<{
    idMap: Map<string, string>;
    nameMap: Map<string, string>;
  }> {
    const idMap = new Map<string, string>();
    const nameMap = new Map<string, string>();
    const { gmail } = await this.getGmailClient();
    const resp = await gmail.users.labels.list({ userId: 'me' });
    const data: any = resp.data;
    const labels: any[] = Array.isArray(data?.labels) ? data.labels : [];
    for (const l of labels) {
      const id = typeof l?.id === 'string' ? l.id : undefined;
      const name = typeof l?.name === 'string' ? l.name : undefined;
      if (id) idMap.set(id, id);
      if (name) nameMap.set(name, id ?? name);
    }
    return { idMap, nameMap };
  }

  private formatMeta(meta: Record<string, unknown>): string {
    try {
      return JSON.stringify(meta);
    } catch {
      return '[unserializable-meta]';
    }
  }

  private formatGmailDate(d: Date): string {
    // Gmail supports operators like newer/older with RFC 822 or yyyy/mm/dd; we use yyyy/mm/dd
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}/${m}/${day}`;
  }
}

// Internal helpers ported from GmailManager
type CredentialKey = Record<string, any>;

interface GmailSendResponse {
  success: boolean;
  messageId?: string;
  threadId?: string;
  gmailUrl?: string;
  errorMessage?: string;
}

interface OAuthCredentials {
  clientId: string;
  clientSecret: string;
}

export interface RawMimeParams {
  from: string;
  to: string[];
  subject: string;
  htmlBody: string;
  cc?: string[];
  bcc?: string[];
  fromName?: string;
  replyToMessageId?: string;
}
