import { URLSearchParams } from 'url';
import { randomUUID } from 'crypto';
import { Logger, type LoggerService } from '@nestjs/common';
import type { Prisma, PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '@quikday/prisma';
import { getAppKeysFromSlug } from '@quikday/appstore';
import type { GmailManagerConfig } from './GmailManagerConfig.js';
import type { GmailManagerOptions } from './GmailManagerOptions.js';
import type { GmailIntegrationValue } from './GmailIntegrationValue.js';
import type { GmailSendEmailOptions } from './GmailSendEmailOptions.js';
import type { GmailSendResponse } from './GmailSendResponse.js';

const DEFAULT_APP_SLUG = 'gmail-email';

type CredentialKey = Prisma.JsonObject & Record<string, unknown>;

interface OAuthCredentials {
  clientId: string;
  clientSecret: string;
}

export class GmailManagerService {
  private readonly prisma: PrismaClient;
  private readonly logger: LoggerService;
  private readonly config: GmailManagerConfig;
  private readonly loggerContext = 'GmailManagerService';
  private cachedOAuth?: OAuthCredentials;

  constructor(options: GmailManagerOptions = {}) {
    this.prisma = options.prisma ?? defaultPrisma;
    this.logger = options.logger ?? new Logger(this.loggerContext);
    this.config = options.config ?? {};
  }

  async getFirstGmailIntegration(userId: number): Promise<GmailIntegrationValue> {
    this.logger.log(
      `Resolving first Gmail credential ${this.formatMeta({ userId })}`,
      this.loggerContext,
    );

    try {
      const credential = await this.prisma.credential.findFirst({
        where: {
          userId,
          appId: this.getAppSlug(),
          invalid: false,
        },
        orderBy: { createdAt: 'desc' },
      });

      if (!credential) {
        return {
          integrationId: null,
          email: 'No Gmail integration found',
          accessToken: '',
          isConnected: false,
        };
      }

      const key = this.safeCredentialKey(credential.key);
      const accessToken =
        this.getStringField(key, 'access_token') ?? this.getStringField(key, 'accessToken');
      const refreshToken =
        this.getStringField(key, 'refresh_token') ?? this.getStringField(key, 'refreshToken');
      const expiresAt = this.resolveExpiresAt(credential.tokenExpiresAt, key);

      const email =
        typeof credential.emailOrUserName === 'string' && credential.emailOrUserName.length > 0
          ? credential.emailOrUserName
          : 'unknown@gmail.com';

      return {
        integrationId: credential.teamId ?? null,
        credentialId: credential.id,
        email,
        accessToken: accessToken ?? '',
        refreshToken: refreshToken ?? null,
        expiresAt,
        isConnected: typeof accessToken === 'string' && accessToken.length > 0,
      };
    } catch (error) {
      this.logger.error(
        `Failed to resolve Gmail integration ${this.formatMeta({ error: this.renderError(error) })}`,
        error instanceof Error ? error.stack : undefined,
        this.loggerContext,
      );
      return {
        integrationId: null,
        email: 'Error retrieving Gmail integration',
        accessToken: '',
        isConnected: false,
      };
    }
  }

  async sendEmail(userId: number, options: GmailSendEmailOptions): Promise<GmailSendResponse> {
    const {
      to,
      subject,
      htmlBody,
      cc = [],
      bcc = [],
      fromName,
      replyToThreadId,
      replyTo,
    } = options;

    this.logger.log(
      `Sending Gmail message ${this.formatMeta({ userId, to, subject })}`,
      this.loggerContext,
    );

    if (!Array.isArray(to) || to.length === 0) {
      return { success: false, errorMessage: 'At least one recipient is required' };
    }
    if (!subject || !subject.trim()) {
      return { success: false, errorMessage: 'Subject is required and cannot be empty' };
    }

    const invalidAddresses = [...to, ...cc, ...bcc].filter(
      (address) => !this.isValidEmail(address),
    );
    if (invalidAddresses.length > 0) {
      return {
        success: false,
        errorMessage: `Invalid email address found: ${invalidAddresses.join(', ')}`,
      };
    }

    try {
      const integration = await this.getFirstGmailIntegration(userId);
      if (!integration.isConnected || !integration.credentialId) {
        return {
          success: false,
          errorMessage: 'No Gmail integration found. Connect a Gmail account first.',
        };
      }

      let accessToken = integration.accessToken;
      if (!accessToken) {
        return {
          success: false,
          errorMessage: 'Gmail access token missing. Reconnect your Gmail account.',
        };
      }

      if (this.isTokenExpired(integration.expiresAt)) {
        this.logger.debug?.(
          `Access token expired; refreshing ${this.formatMeta({ credentialId: integration.credentialId })}`,
          this.loggerContext,
        );
        accessToken = await this.refreshAccessToken(integration.credentialId);
      }

      const rawMessage = this.createRawMimeMessage({
        from: integration.email,
        to,
        subject,
        htmlBody,
        cc,
        bcc,
        fromName,
        replyToThreadId,
        replyTo,
      });

      const response = await this.sendEmailViaGmailApi('me', rawMessage, accessToken);

      this.logger.log(
        `Gmail message sent ${this.formatMeta({
          from: integration.email,
          to,
          messageId: response.messageId,
          threadId: response.threadId,
        })}`,
        this.loggerContext,
      );

      return response;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `Failed to send Gmail message ${this.formatMeta({ error: this.renderError(error) })}`,
        error instanceof Error ? error.stack : undefined,
        this.loggerContext,
      );
      return { success: false, errorMessage: message };
    }
  }

  async refreshAccessToken(credentialId: number): Promise<string> {
    this.logger.log(
      `Refreshing Gmail access token ${this.formatMeta({ credentialId })}`,
      this.loggerContext,
    );

    const credential = await this.prisma.credential.findUnique({ where: { id: credentialId } });
    if (!credential) {
      throw new Error('Gmail credential not found. Reconnect your Gmail account.');
    }

    const key = this.safeCredentialKey(credential.key);
    const refreshToken =
      this.getStringField(key, 'refresh_token') ?? this.getStringField(key, 'refreshToken');

    if (!refreshToken) {
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
      this.logger.error(
        `Token refresh failed ${this.formatMeta({ status: response.status, error: errorContent })}`,
        undefined,
        this.loggerContext,
      );
      throw new Error(`Failed to refresh Gmail access token: ${errorContent}`);
    }

    const tokenResponse = (await response.json()) as Record<string, unknown>;
    const newAccessToken = this.getStringField(tokenResponse, 'access_token');
    const expiresIn = this.getNumberField(tokenResponse, 'expires_in');

    if (!newAccessToken || typeof expiresIn !== 'number' || Number.isNaN(expiresIn)) {
      throw new Error('Invalid token response from Google');
    }

    const newExpiresAt = new Date(Date.now() + expiresIn * 1000);

    const updatedKey: CredentialKey = {
      ...key,
      access_token: newAccessToken,
      expires_at: newExpiresAt.toISOString(),
    };

    const refreshedToken = this.getStringField(tokenResponse, 'refresh_token');
    if (refreshedToken) {
      updatedKey.refresh_token = refreshedToken;
    }

    await this.prisma.credential.update({
      where: { id: credentialId },
      data: {
        key: updatedKey as Prisma.InputJsonValue,
        tokenExpiresAt: newExpiresAt,
      },
    });

    this.logger.log(
      `Refreshed Gmail access token ${this.formatMeta({ credentialId, expiresAt: newExpiresAt })}`,
      this.loggerContext,
    );

    return newAccessToken;
  }

  isTokenExpired(expiresAt?: Date | null): boolean {
    if (!expiresAt) {
      return true;
    }
    const bufferMs = 5 * 60 * 1000;
    return Date.now() >= expiresAt.getTime() - bufferMs;
  }

  getGmailThreadIdFromLabels(labelIds?: string | null): string | null {
    if (!labelIds) return null;
    const labels = labelIds.split(',').map((label) => label.trim());
    const threadLabel = labels.find((label) => label.startsWith('gmail_thread:'));
    return threadLabel ? threadLabel.substring('gmail_thread:'.length) : null;
  }

  storeGmailThreadIdInLabels(
    existingLabels: string | null | undefined,
    gmailThreadId: string,
  ): string {
    const gmailThreadLabel = `gmail_thread:${gmailThreadId}`;
    if (!existingLabels) return gmailThreadLabel;

    const labels = existingLabels
      .split(',')
      .map((label) => label.trim())
      .filter((label) => label.length > 0 && !label.startsWith('gmail_thread:'));

    labels.push(gmailThreadLabel);
    return labels.join(',');
  }

  getGmailMessageUrl(externalMessageId?: string | null): string | null {
    if (!externalMessageId) return null;
    return `https://mail.google.com/mail/u/0/#all/${externalMessageId}`;
  }

  getGmailThreadUrl(labelIds?: string | null): string | null {
    const threadId = this.getGmailThreadIdFromLabels(labelIds);
    if (!threadId) return null;
    return `https://mail.google.com/mail/u/0/#all/${threadId}`;
  }

  generateGmailWebUrl(
    externalMessageId?: string | null,
    threadIdOrLabels?: string | null,
  ): string | null {
    if (externalMessageId) {
      return this.getGmailMessageUrl(externalMessageId);
    }

    if (threadIdOrLabels) {
      if (this.looksLikeUuid(threadIdOrLabels)) {
        return `https://mail.google.com/mail/u/0/#all/${threadIdOrLabels}`;
      }
      return this.getGmailThreadUrl(threadIdOrLabels);
    }

    return null;
  }

  async getGmailMetadata(): Promise<never> {
    this.logger.warn(
      'getGmailMetadata is not supported on GmailManagerService',
      this.loggerContext,
    );
    throw new Error('Gmail metadata retrieval should be handled by EmailComposerAppService');
  }

  async getEmailsInGmailThread(): Promise<never> {
    this.logger.warn(
      'getEmailsInGmailThread is not supported on GmailManagerService',
      this.loggerContext,
    );
    throw new Error('Gmail thread email retrieval should be handled by EmailComposerAppService');
  }

  async createReplyDraft(): Promise<never> {
    this.logger.warn(
      'createReplyDraft is not supported on GmailManagerService',
      this.loggerContext,
    );
    throw new Error('Reply draft creation should be handled by EmailComposerAppService');
  }

  private async sendEmailViaGmailApi(
    userId: string,
    rawMessage: string,
    accessToken: string,
  ): Promise<GmailSendResponse> {
    const response = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/${encodeURIComponent(userId)}/messages/send`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ raw: rawMessage }),
      },
    );

    if (!response.ok) {
      const errorContent = await response.text();
      this.logger.error(
        `Gmail API error ${this.formatMeta({ status: response.status, error: errorContent })}`,
        undefined,
        this.loggerContext,
      );

      if (response.status === 400) {
        try {
          const decoded = this.decodeBase64UrlSafe(rawMessage);
          this.logger.debug?.(
            `Raw MIME message that caused error ${this.formatMeta({ decoded })}`,
            this.loggerContext,
          );
        } catch (error) {
          this.logger.warn(
            `Failed to decode raw message for debugging ${this.formatMeta({
              error: this.renderError(error),
            })}`,
            this.loggerContext,
          );
        }
      }

      if (response.status === 401) {
        throw new Error(
          'Gmail access token has expired or is invalid. Reconnect your Gmail account.',
        );
      }

      throw new Error(`Failed to send email via Gmail API: ${response.status} - ${errorContent}`);
    }

    const payload = (await response.json()) as Record<string, unknown>;
    const messageId = this.getStringField(payload, 'id') ?? '';
    const threadId = this.getStringField(payload, 'threadId') ?? '';

    return {
      success: true,
      messageId,
      threadId,
      gmailUrl: this.generateGmailWebUrl(messageId, threadId),
    };
  }

  private createRawMimeMessage(params: {
    from: string;
    to: string[];
    subject: string;
    htmlBody: string;
    cc?: string[];
    bcc?: string[];
    fromName?: string;
    replyToThreadId?: string;
    replyTo?: string;
  }): string {
    const {
      from,
      to,
      subject,
      htmlBody,
      cc = [],
      bcc = [],
      fromName,
      replyToThreadId,
      replyTo,
    } = params;
    const fromHeader = fromName ? `${fromName} <${from}>` : from;
    const lines: string[] = [];

    lines.push(`From: ${fromHeader}`);
    lines.push(`To: ${to.join(', ')}`);
    if (cc.length > 0) lines.push(`Cc: ${cc.join(', ')}`);
    if (bcc.length > 0) lines.push(`Bcc: ${bcc.join(', ')}`);
    lines.push(`Subject: ${subject}`);
    lines.push(`Date: ${new Date().toUTCString()}`);
    lines.push(`Message-ID: <${randomUUID()}@gmail.com>`);

    if (replyTo) {
      lines.push(`Reply-To: ${replyTo}`);
    }

    if (replyToThreadId) {
      lines.push(`References: <${replyToThreadId}>`);
      lines.push(`In-Reply-To: <${replyToThreadId}>`);
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

  private safeCredentialKey(key: Prisma.JsonValue | null): CredentialKey {
    if (key && typeof key === 'object' && !Array.isArray(key)) {
      return key as CredentialKey;
    }
    return {} as CredentialKey;
  }

  private resolveExpiresAt(storedExpiresAt: Date | null, key: CredentialKey): Date | undefined {
    if (storedExpiresAt) return storedExpiresAt;

    const expiresAtStr = this.getStringField(key, 'expires_at');
    if (expiresAtStr) {
      const parsed = new Date(expiresAtStr);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed;
      }
    }

    const expiryDate = this.getNumberField(key, 'expiry_date');
    if (typeof expiryDate === 'number' && !Number.isNaN(expiryDate)) {
      const date = new Date(expiryDate);
      if (!Number.isNaN(date.getTime())) {
        return date;
      }
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

  private async getOAuthCredentials(): Promise<OAuthCredentials> {
    if (this.cachedOAuth) {
      return this.cachedOAuth;
    }

    let clientId = this.config.clientId ?? process.env.GMAIL_CLIENT_ID;
    let clientSecret = this.config.clientSecret ?? process.env.GMAIL_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      try {
        const appKeys = (await getAppKeysFromSlug(this.getAppSlug())) as Record<string, unknown>;
        if (!clientId && typeof appKeys?.client_id === 'string') clientId = appKeys.client_id;
        if (!clientSecret && typeof appKeys?.client_secret === 'string')
          clientSecret = appKeys.client_secret;
      } catch (error) {
        this.logger.debug?.(
          `Failed to resolve OAuth credentials from app keys ${this.formatMeta({
            error: this.renderError(error),
          })}`,
          this.loggerContext,
        );
      }
    }

    if (!clientId || !clientSecret) {
      throw new Error('Gmail OAuth configuration not found. Provide clientId and clientSecret.');
    }

    this.cachedOAuth = { clientId, clientSecret };
    return this.cachedOAuth;
  }

  private decodeBase64UrlSafe(base64UrlSafe: string): string {
    const base64 = base64UrlSafe.replace(/-/g, '+').replace(/_/g, '/');
    const padding = base64.length % 4;
    const padded = padding > 0 ? base64.padEnd(base64.length + (4 - padding), '=') : base64;
    return Buffer.from(padded, 'base64').toString('utf8');
  }

  private isValidEmail(email: string): boolean {
    if (!email || !email.trim()) return false;
    const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
    return EMAIL_REGEX.test(email);
  }

  private looksLikeUuid(value: string): boolean {
    const UUID_REGEX =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
    return UUID_REGEX.test(value);
  }

  private getAppSlug(): string {
    return this.config.slug ?? DEFAULT_APP_SLUG;
  }

  private formatMeta(meta: Record<string, unknown>): string {
    try {
      return JSON.stringify(meta);
    } catch {
      return '[unserializable-meta]';
    }
  }

  private renderError(error: unknown): string {
    if (error instanceof Error) {
      return `${error.name}: ${error.message}`;
    }
    if (typeof error === 'string') {
      return error;
    }
    return 'Unknown error';
  }
}

export default GmailManagerService;
