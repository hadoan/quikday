import { Logger, type LoggerService } from '@nestjs/common';
import type { Credential, Prisma, PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '@quikday/prisma';
import {
  baseCalendarEventSchema,
  getAppKeysFromSlug,
  toIsoFromStartAndMaybeEnd,
  type BaseCalendarEvent,
  type CalendarEventResponse,
} from '@quikday/appstore';
import { google, type calendar_v3 } from 'googleapis';

import type { GoogleCalendarTokens } from '../types/GoogleCalendarTokens.js';

const DEFAULT_APP_SLUG = 'google-calendar';

interface OAuthCredentials {
  clientId: string;
  clientSecret: string;
}

export interface GoogleCalendarServiceConfig {
  slug?: string;
  clientId?: string;
  clientSecret?: string;
  defaultTimeZone?: string;
}

export interface GoogleCalendarServiceOptions {
  prisma?: PrismaClient;
  logger?: LoggerService;
  config?: GoogleCalendarServiceConfig;
}

export interface CreateGoogleCalendarEventOptions extends BaseCalendarEvent {
  calendarId?: string;
  timeZone?: string;
  sendUpdates?: 'all' | 'externalOnly' | 'none';
  reminders?: calendar_v3.Schema$Event['reminders'];
}

type CredentialJson = Prisma.JsonObject & Record<string, unknown>;
type OAuthCredentialSnapshot = {
  access_token?: string | null;
  refresh_token?: string | null;
  scope?: string | null;
  token_type?: string | null;
  id_token?: string | null;
  expiry_date?: number | null;
};

export class GoogleCalendarService {
  private readonly prisma: PrismaClient;
  private readonly logger: LoggerService;
  private readonly config: GoogleCalendarServiceConfig;
  private readonly loggerContext = 'GoogleCalendarService';
  private cachedOAuth?: OAuthCredentials;

  constructor(options: GoogleCalendarServiceOptions = {}) {
    this.prisma = options.prisma ?? defaultPrisma;
    this.logger = options.logger ?? new Logger(this.loggerContext);
    this.config = {
      defaultTimeZone: options.config?.defaultTimeZone ?? 'UTC',
      ...options.config,
    };
  }

  async createCalendarEvent(
    userId: number,
    input: CreateGoogleCalendarEventOptions,
  ): Promise<CalendarEventResponse> {
    const startedAt = Date.now();
    let eventId: string | undefined;
    let result: CalendarEventResponse | undefined;
    this.logger.log(
      `Creating Google Calendar event ${this.formatMeta({
        userId,
        calendarId: input.calendarId ?? 'primary',
      })}`,
      this.loggerContext,
    );
    this.logger.debug?.(
      `Raw payload received ${this.formatMeta({
        userId,
        calendarId: input.calendarId ?? 'primary',
        hasAttendees: !!input.attendees,
        hasReminders: !!input.reminders,
      })}`,
      this.loggerContext,
    );

    let parsed: BaseCalendarEvent;
    try {
      parsed = baseCalendarEventSchema.parse(input);
      this.logger.debug?.(
        `Validated event payload ${this.formatMeta({
          userId,
          title: parsed.title,
          start: parsed.start,
          end: parsed.end ?? null,
          duration: parsed.durationMinutes ?? null,
        })}`,
        this.loggerContext,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid calendar event payload';
      this.logger.error(
        `Invalid Google Calendar event payload ${this.formatMeta({
          userId,
          error: this.renderError(error),
        })}`,
        error instanceof Error ? error.stack : undefined,
        this.loggerContext,
      );
      return { success: false, message };
    }

    const { startIso, endIso } = toIsoFromStartAndMaybeEnd(
      parsed.start,
      parsed.end,
      parsed.durationMinutes,
    );

    try {
      const { calendar, oauth2Client, credentialId, tokenRecord } =
        await this.getAuthorizedCalendar(userId);

      const attendees = this.parseAttendees(parsed.attendees);
      const timeZone = input.timeZone ?? this.config.defaultTimeZone ?? 'UTC';
      const calendarId = input.calendarId ?? 'primary';

      const response = await calendar.events.insert({
        calendarId,
        requestBody: {
          summary: parsed.title,
          description: parsed.description,
          location: parsed.location || undefined,
          start: {
            dateTime: startIso,
            timeZone,
          },
          end: {
            dateTime: endIso,
            timeZone,
          },
          attendees: attendees.length ? attendees : undefined,
          reminders: input.reminders,
        },
        sendUpdates: input.sendUpdates ?? 'all',
      });

      await this.persistTokensIfChanged(
        credentialId,
        tokenRecord,
        oauth2Client.credentials as OAuthCredentialSnapshot,
      );

      const event = response.data;

      this.logger.log(
        `Google Calendar event created ${this.formatMeta({
          userId,
          calendarId,
          eventId: event.id,
        })}`,
        this.loggerContext,
      );

      result = {
        success: true,
        message: `Event '${parsed.title}' created in Google Calendar`,
        eventId: event.id ?? undefined,
        startIso,
        endIso,
      };
      eventId = result.eventId;
    } catch (error) {
      this.logger.error(
        `Failed to create Google Calendar event ${this.formatMeta({
          userId,
          calendarId: input.calendarId ?? 'primary',
          error: this.renderError(error),
        })}`,
        error instanceof Error ? error.stack : undefined,
        this.loggerContext,
      );

      let message =
        error instanceof Error ? error.message : 'Failed to create Google Calendar event';

      // Provide helpful error messages for common issues
      if (
        message.includes('Calendar API has not been used') ||
        message.includes('API has not been used')
      ) {
        message =
          'Google Calendar API is not enabled. Please enable it in your Google Cloud Console: https://console.cloud.google.com/apis/library/calendar-json.googleapis.com';
      } else if (message.includes('invalid_grant') || message.includes('Token has been expired')) {
        message = 'Your Google Calendar connection has expired. Please reconnect your account.';
      } else if (message.includes('insufficient permissions') || message.includes('403')) {
        message =
          'Insufficient permissions to access Google Calendar. Please reconnect with the required calendar permissions.';
      }

      result = { success: false, message };
    }

    this.logger.log(
      `Completed Google Calendar create flow ${this.formatMeta({
        userId,
        calendarId: input.calendarId ?? 'primary',
        eventId: eventId ?? null,
        success: result?.success ?? false,
        durationMs: Date.now() - startedAt,
      })}`,
      this.loggerContext,
    );

    return result ?? { success: false, message: 'Unknown error creating Google Calendar event' };
  }

  private async getAuthorizedCalendar(userId: number) {
    const appSlug = this.getAppSlug();
    const teamIds = await this.getUserTeamIds(userId);

    type ResolutionStrategy = {
      label: string;
      where: Prisma.CredentialWhereInput;
      orderBy?:
        | Prisma.CredentialOrderByWithRelationInput
        | Prisma.CredentialOrderByWithRelationInput[];
    };

    const strategies: ResolutionStrategy[] = [
      {
        label: 'user-current-profile',
        where: {
          userId,
          appId: appSlug,
          isUserCurrentProfile: true,
          invalid: false,
        },
        orderBy: { updatedAt: 'desc' },
      },
      {
        label: 'user-fallback',
        where: {
          userId,
          appId: appSlug,
          invalid: false,
        },
        orderBy: { updatedAt: 'desc' },
      },
    ];

    if (teamIds.length > 0) {
      strategies.splice(1, 0, {
        label: 'team-default-profile',
        where: {
          teamId: { in: teamIds },
          appId: appSlug,
          isTeamDefaultProfile: true,
          invalid: false,
        },
        orderBy: { updatedAt: 'desc' },
      });
      strategies.push({
        label: 'team-fallback',
        where: {
          teamId: { in: teamIds },
          appId: appSlug,
          invalid: false,
        },
        orderBy: { updatedAt: 'desc' },
      });
    }

    let credential: Credential | null = null;
    let resolvedVia: string | undefined;

    for (const strategy of strategies) {
      const result = await this.prisma.credential.findFirst({
        where: strategy.where,
        ...(strategy.orderBy ? { orderBy: strategy.orderBy } : {}),
      });

      if (result) {
        credential = result;
        resolvedVia = strategy.label;
        break;
      }
    }

    if (!credential) {
      this.logger.debug?.(
        `No credential matched ${this.formatMeta({
          userId,
          appId: appSlug,
          teamIds,
          attempts: strategies.map((strategy) => strategy.label),
        })}`,
        this.loggerContext,
      );
      throw new Error('No Google Calendar credential found. Connect your Google Calendar account.');
    }
    this.logger.debug?.(
      `Resolved credential ${this.formatMeta({
        userId,
        credentialId: credential.id,
        hasTokenExpiresAt: !!credential.tokenExpiresAt,
        resolvedVia: resolvedVia ?? 'unknown',
      })}`,
      this.loggerContext,
    );

    const credentialKey = this.safeCredentialKey(credential.key);
    const tokens = this.extractTokens(credentialKey, credential);
    if (!tokens.access_token && !tokens.refresh_token) {
      throw new Error('Google Calendar tokens missing. Reconnect your Google Calendar account.');
    }
    this.logger.debug?.(
      `Resolved credential tokens ${this.formatMeta({
        userId,
        credentialId: credential.id,
        hasAccessToken: !!tokens.access_token,
        hasRefreshToken: !!tokens.refresh_token,
        hasExpiry: !!tokens.expiry_date,
      })}`,
      this.loggerContext,
    );

    const { clientId, clientSecret } = await this.getOAuthCredentials();
    this.logger.debug?.(
      `Loaded OAuth client configuration ${this.formatMeta({
        clientIdSuffix: clientId.slice(-4),
        usingCache: !!this.cachedOAuth,
      })}`,
      this.loggerContext,
    );

    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
    oauth2Client.setCredentials({
      access_token: tokens.access_token ?? undefined,
      refresh_token: tokens.refresh_token ?? undefined,
      expiry_date: tokens.expiry_date ?? credential.tokenExpiresAt?.getTime(),
      token_type: tokens.token_type ?? undefined,
      scope: tokens.scope ?? undefined,
      id_token: tokens.id_token ?? undefined,
    });

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    return {
      calendar,
      oauth2Client,
      credentialId: credential.id,
      tokenRecord: credentialKey,
    };
  }

  private async getUserTeamIds(userId: number): Promise<number[]> {
    try {
      const memberships = await this.prisma.teamMember.findMany({
        where: { userId },
        select: { teamId: true },
      });
      const unique = new Set<number>();
      for (const membership of memberships) {
        if (typeof membership.teamId === 'number') {
          unique.add(membership.teamId);
        }
      }
      return [...unique];
    } catch (error) {
      this.logger.debug?.(
        `Failed to load team memberships ${this.formatMeta({
          userId,
          error: this.renderError(error),
        })}`,
        this.loggerContext,
      );
      return [];
    }
  }

  private parseAttendees(attendees?: string): calendar_v3.Schema$EventAttendee[] {
    if (!attendees) return [];
    return attendees
      .split(',')
      .map((value) => value.trim())
      .filter((value) => value.length > 0)
      .map((email) => ({ email }));
  }

  private safeCredentialKey(key: Prisma.JsonValue | null): CredentialJson {
    if (key && typeof key === 'object' && !Array.isArray(key)) {
      return key as CredentialJson;
    }
    return {} as CredentialJson;
  }

  private extractTokens(record: CredentialJson, credential: Credential): GoogleCalendarTokens {
    const tokens: GoogleCalendarTokens = {};

    const accessToken = this.getStringField(record, 'access_token');
    const refreshToken = this.getStringField(record, 'refresh_token');
    const scope = this.getStringField(record, 'scope');
    const tokenType = this.getStringField(record, 'token_type');
    const idToken = this.getStringField(record, 'id_token');

    if (accessToken) tokens.access_token = accessToken;
    if (refreshToken) tokens.refresh_token = refreshToken;
    if (scope) tokens.scope = scope;
    if (tokenType) tokens.token_type = tokenType;
    if (idToken) tokens.id_token = idToken;

    const expiryDate = this.getNumberField(record, 'expiry_date');
    if (typeof expiryDate === 'number') {
      tokens.expiry_date = expiryDate;
    } else if (credential.tokenExpiresAt) {
      tokens.expiry_date = credential.tokenExpiresAt.getTime();
    }

    return tokens;
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

    let clientId = this.config.clientId ?? process.env.GOOGLE_CLIENT_ID;
    let clientSecret = this.config.clientSecret ?? process.env.GOOGLE_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      try {
        this.logger.debug?.(
          'Attempting to resolve OAuth credentials from app keys',
          this.loggerContext,
        );
        const appKeys = (await getAppKeysFromSlug(this.prisma, this.getAppSlug())) as Record<string, unknown>;
        if (!clientId && typeof appKeys?.client_id === 'string') clientId = appKeys.client_id;
        if (!clientSecret && typeof appKeys?.client_secret === 'string') {
          clientSecret = appKeys.client_secret;
        }
      } catch (error) {
        this.logger.debug?.(
          `Failed to load Google Calendar OAuth credentials ${this.formatMeta({
            error: this.renderError(error),
          })}`,
          this.loggerContext,
        );
      }
    }

    if (!clientId || !clientSecret) {
      throw new Error(
        'Google Calendar OAuth credentials not configured. Provide clientId and clientSecret.',
      );
    }

    this.cachedOAuth = { clientId, clientSecret };
    return this.cachedOAuth;
  }

  private async persistTokensIfChanged(
    credentialId: number,
    previousRecord: CredentialJson,
    credentials: OAuthCredentialSnapshot,
  ): Promise<void> {
    const normalized = this.normalizeCredentials(credentials);
    const { changed, record, expiryDate } = this.buildUpdatedTokenRecord(
      previousRecord,
      normalized,
    );
    if (!changed) return;
    this.logger.debug?.(
      `Detected credential token changes ${this.formatMeta({
        credentialId,
        hasExpiry: !!expiryDate,
      })}`,
      this.loggerContext,
    );

    try {
      await this.prisma.credential.update({
        where: { id: credentialId },
        data: {
          key: record as Prisma.InputJsonValue,
          tokenExpiresAt: expiryDate,
        },
      });
    } catch (error) {
      this.logger.warn(
        `Failed to persist updated Google Calendar tokens ${this.formatMeta({
          credentialId,
          error: this.renderError(error),
        })}`,
        this.loggerContext,
      );
    }
  }

  private normalizeCredentials(credentials: OAuthCredentialSnapshot): GoogleCalendarTokens {
    const normalized: GoogleCalendarTokens = {};
    if (typeof credentials.access_token === 'string')
      normalized.access_token = credentials.access_token;
    if (typeof credentials.refresh_token === 'string') {
      normalized.refresh_token = credentials.refresh_token;
    }
    if (typeof credentials.scope === 'string') normalized.scope = credentials.scope;
    if (typeof credentials.token_type === 'string') normalized.token_type = credentials.token_type;
    if (typeof credentials.id_token === 'string') normalized.id_token = credentials.id_token;
    if (typeof credentials.expiry_date === 'number' && !Number.isNaN(credentials.expiry_date)) {
      normalized.expiry_date = credentials.expiry_date;
    }
    return normalized;
  }

  private buildUpdatedTokenRecord(
    previous: CredentialJson,
    credentials: GoogleCalendarTokens,
  ): { changed: boolean; record: CredentialJson; expiryDate: Date | null } {
    if (!credentials || Object.keys(credentials).length === 0) {
      return { changed: false, record: previous, expiryDate: null };
    }

    const merged: CredentialJson = { ...previous };
    let changed = false;

    const updateField = (field: keyof GoogleCalendarTokens, value?: string | number | null) => {
      const key = field as string;
      if (value === undefined) return;
      if (value === null) {
        if (key in merged) {
          delete merged[key];
          changed = true;
        }
        return;
      }
      if (merged[key] !== value) {
        merged[key] = value;
        changed = true;
      }
    };

    updateField('access_token', credentials.access_token ?? undefined);
    updateField('refresh_token', credentials.refresh_token ?? undefined);
    updateField('scope', credentials.scope ?? undefined);
    updateField('token_type', credentials.token_type ?? undefined);
    updateField('id_token', credentials.id_token ?? undefined);

    let expiryDate: Date | null = null;
    if (typeof credentials.expiry_date === 'number' && !Number.isNaN(credentials.expiry_date)) {
      updateField('expiry_date', credentials.expiry_date);
      const parsed = new Date(credentials.expiry_date);
      expiryDate = Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    return { changed, record: merged, expiryDate };
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

export default GoogleCalendarService;
