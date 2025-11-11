import { Injectable, Logger } from '@nestjs/common';
import type { CalendarService } from '@quikday/appstore/calendar/calendar.service';
import type {
  AvailabilityQuery,
  AvailabilityResult,
  CalendarEvent,
  CalendarAttendee,
} from '@quikday/appstore/calendar/calendar.types';
import { CurrentUserService } from '@quikday/libs';
import { PrismaService } from '@quikday/prisma';
import { getAppKeysFromSlug } from '@quikday/appstore';
import { Office365CalendarTokens } from './types/Office365CalendarTokens.js';

interface MicrosoftCalendar {
  id?: string;
  name?: string;
  isDefaultCalendar?: boolean;
  canEdit?: boolean;
}

interface MicrosoftEvent {
  id?: string;
  subject?: string;
  bodyPreview?: string;
  body?: { content?: string; contentType?: string };
  start?: { dateTime?: string; timeZone?: string };
  end?: { dateTime?: string; timeZone?: string };
  location?: { displayName?: string };
  attendees?: Array<{
    emailAddress?: { address?: string; name?: string };
    type?: string;
    status?: { response?: string };
  }>;
  organizer?: { emailAddress?: { address?: string; name?: string } };
  webLink?: string;
  showAs?: string;
}

interface MicrosoftUser {
  mail?: string | null;
  userPrincipalName?: string;
}

@Injectable()
export class Office365CalendarProviderService implements CalendarService {
  readonly provider = 'outlook' as const;
  private readonly logger = new Logger('Office365CalendarProviderService');
  private readonly apiGraphUrl = 'https://graph.microsoft.com/v1.0';

  constructor(
    private currentUser: CurrentUserService,
    private prisma: PrismaService,
  ) {}

  async checkAvailability(query: AvailabilityQuery): Promise<AvailabilityResult> {
    this.logger.log(this.format({ op: 'checkAvailability', start: query.start, end: query.end }));

    try {
      const accessToken = await this.getAccessToken();
      const response = await fetch(
        `${this.apiGraphUrl}/me/calendar/calendarView?startDateTime=${query.start.toISOString()}&endDateTime=${query.end.toISOString()}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        },
      );

      if (!response.ok) {
        throw new Error(`Failed to check availability: ${response.statusText}`);
      }

      const data = (await response.json()) as { value: MicrosoftEvent[] };
      const busyEvents = (data.value || []).filter(
        (evt) => evt.showAs !== 'free' && evt.showAs !== 'workingElsewhere',
      );

      const available = busyEvents.length === 0;
      return { available, start: query.start, end: query.end, attendees: query.attendees };
    } catch (error) {
      this.logger.warn(
        this.format({ op: 'checkAvailability.error', error: this.renderError(error) }),
      );
      return { available: false, start: query.start, end: query.end, attendees: query.attendees };
    }
  }

  async createEvent(
    event: Omit<CalendarEvent, 'id'> & { notifyAttendees?: boolean },
  ): Promise<{ id: string; htmlLink?: string; start: Date; end: Date }> {
    this.logger.log(this.format({ op: 'createEvent', title: event.title }));
    const { accessToken, credentialId } = await this.getAccessTokenWithId();

    const attendees = this.mapAttendees(event.attendees ?? []);
    const startIso = event.start.toISOString();
    const endIso = event.end.toISOString();

    const requestBody = {
      subject: event.title,
      body: {
        contentType: 'HTML',
        content: event.description || '',
      },
      start: {
        dateTime: startIso.replace('Z', ''),
        timeZone: event.timezone || 'UTC',
      },
      end: {
        dateTime: endIso.replace('Z', ''),
        timeZone: event.timezone || 'UTC',
      },
      location: event.location ? { displayName: event.location } : undefined,
      attendees: attendees.length ? attendees : undefined,
    };

    try {
      const response = await fetch(`${this.apiGraphUrl}/me/calendar/events`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to create event: ${response.statusText} - ${errorText}`);
      }

      const data = (await response.json()) as MicrosoftEvent;

      return {
        id: data.id || '',
        htmlLink: data.webLink,
        start: event.start,
        end: event.end,
      };
    } catch (error) {
      this.logger.error(this.format({ op: 'createEvent.error', error: this.renderError(error) }));
      throw new Error(
        error instanceof Error ? error.message : 'Failed to create Office 365 Calendar event',
      );
    }
  }

  async listEvents(args: {
    start: Date;
    end: Date;
    pageToken?: string;
    pageSize?: number;
  }): Promise<{ nextPageToken?: string; items: CalendarEvent[] }> {
    this.logger.log(
      this.format({
        op: 'listEvents',
        start: args.start,
        end: args.end,
        pageToken: args.pageToken,
      }),
    );
    const { accessToken } = await this.getAccessTokenWithId();

    try {
      const maxResults = Math.min(Math.max(args.pageSize ?? 50, 1), 250);
      const url = args.pageToken
        ? args.pageToken
        : `${this.apiGraphUrl}/me/calendar/calendarView?startDateTime=${args.start.toISOString()}&endDateTime=${args.end.toISOString()}&$top=${maxResults}`;

      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to list events: ${response.statusText}`);
      }

      const data = (await response.json()) as {
        value: MicrosoftEvent[];
        '@odata.nextLink'?: string;
      };

      const items: CalendarEvent[] = (data.value || []).map((e) => {
        const startIso = e.start?.dateTime
          ? `${e.start.dateTime}${e.start.dateTime.endsWith('Z') ? '' : 'Z'}`
          : new Date().toISOString();
        const endIso = e.end?.dateTime
          ? `${e.end.dateTime}${e.end.dateTime.endsWith('Z') ? '' : 'Z'}`
          : new Date().toISOString();

        const attendees = Array.isArray(e.attendees)
          ? e.attendees
              .map((a) =>
                a?.emailAddress?.address
                  ? ({
                      email: a.emailAddress.address,
                      name: a.emailAddress.name ?? undefined,
                      optional: a.type === 'optional',
                      responseStatus: this.mapResponseStatus(a.status?.response),
                    } as CalendarAttendee)
                  : null,
              )
              .filter((x): x is CalendarAttendee => !!x)
          : undefined;

        return {
          id: e.id || '',
          title: e.subject || '',
          description: e.body?.content || e.bodyPreview || undefined,
          start: new Date(startIso),
          end: new Date(endIso),
          timezone: e.start?.timeZone || e.end?.timeZone || undefined,
          attendees,
          location: e.location?.displayName || undefined,
          htmlLink: e.webLink || undefined,
          organizer: e.organizer?.emailAddress?.address || undefined,
          conference: undefined,
        } as CalendarEvent;
      });

      return {
        nextPageToken: data['@odata.nextLink'] ?? undefined,
        items,
      };
    } catch (error) {
      this.logger.warn(this.format({ op: 'listEvents.error', error: this.renderError(error) }));
      return { items: [] };
    }
  }

  async updateEvent(id: string, patch: Partial<CalendarEvent>): Promise<CalendarEvent> {
    this.logger.log(this.format({ op: 'updateEvent', id }));
    const { accessToken } = await this.getAccessTokenWithId();

    try {
      const requestBody: any = {};
      if (typeof patch.title === 'string') requestBody.subject = patch.title;
      if (typeof patch.description === 'string')
        requestBody.body = { contentType: 'HTML', content: patch.description };
      if (typeof patch.location === 'string')
        requestBody.location = { displayName: patch.location };
      if (patch.start)
        requestBody.start = {
          dateTime: patch.start.toISOString().replace('Z', ''),
          timeZone: patch.timezone || 'UTC',
        };
      if (patch.end)
        requestBody.end = {
          dateTime: patch.end.toISOString().replace('Z', ''),
          timeZone: patch.timezone || 'UTC',
        };
      if (Array.isArray(patch.attendees)) requestBody.attendees = this.mapAttendees(patch.attendees);

      const response = await fetch(`${this.apiGraphUrl}/me/calendar/events/${id}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to update event: ${response.statusText} - ${errorText}`);
      }

      const data = (await response.json()) as MicrosoftEvent;

      const startIso = data.start?.dateTime
        ? `${data.start.dateTime}${data.start.dateTime.endsWith('Z') ? '' : 'Z'}`
        : new Date().toISOString();
      const endIso = data.end?.dateTime
        ? `${data.end.dateTime}${data.end.dateTime.endsWith('Z') ? '' : 'Z'}`
        : new Date().toISOString();

      const attendees = Array.isArray(data.attendees)
        ? data.attendees
            .map((a) =>
              a?.emailAddress?.address
                ? ({
                    email: a.emailAddress.address,
                    name: a.emailAddress.name ?? undefined,
                    optional: a.type === 'optional',
                  } as CalendarAttendee)
                : null,
            )
            .filter((x): x is CalendarAttendee => !!x)
        : undefined;

      return {
        id: data.id || id,
        title: data.subject || patch.title || '',
        description: data.body?.content || patch.description || undefined,
        start: new Date(startIso),
        end: new Date(endIso),
        timezone: data.start?.timeZone || data.end?.timeZone || patch.timezone || undefined,
        attendees,
        location: data.location?.displayName || patch.location || undefined,
        htmlLink: data.webLink || undefined,
        organizer: data.organizer?.emailAddress?.address || undefined,
        conference: undefined,
      };
    } catch (error) {
      this.logger.error(
        this.format({ op: 'updateEvent.error', id, error: this.renderError(error) }),
      );
      throw new Error(
        error instanceof Error ? error.message : 'Failed to update Office 365 Calendar event',
      );
    }
  }

  async deleteEvent(id: string): Promise<void> {
    this.logger.log(this.format({ op: 'deleteEvent', id }));
    const { accessToken } = await this.getAccessTokenWithId();

    try {
      const response = await fetch(`${this.apiGraphUrl}/me/calendar/events/${id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!response.ok && response.status !== 204) {
        throw new Error(`Failed to delete event: ${response.statusText}`);
      }
    } catch (error) {
      this.logger.error(
        this.format({ op: 'deleteEvent.error', id, error: this.renderError(error) }),
      );
      throw new Error(
        error instanceof Error ? error.message : 'Failed to delete Office 365 Calendar event',
      );
    }
  }

  async getEvent(id: string): Promise<CalendarEvent | null> {
    this.logger.log(this.format({ op: 'getEvent', id }));
    const { accessToken } = await this.getAccessTokenWithId();

    try {
      const response = await fetch(`${this.apiGraphUrl}/me/calendar/events/${id}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        if (response.status === 404) return null;
        throw new Error(`Failed to get event: ${response.statusText}`);
      }

      const data = (await response.json()) as MicrosoftEvent;

      const startIso = data.start?.dateTime
        ? `${data.start.dateTime}${data.start.dateTime.endsWith('Z') ? '' : 'Z'}`
        : new Date().toISOString();
      const endIso = data.end?.dateTime
        ? `${data.end.dateTime}${data.end.dateTime.endsWith('Z') ? '' : 'Z'}`
        : new Date().toISOString();

      const attendees = Array.isArray(data.attendees)
        ? data.attendees
            .map((a) =>
              a?.emailAddress?.address
                ? ({
                    email: a.emailAddress.address,
                    name: a.emailAddress.name ?? undefined,
                    optional: a.type === 'optional',
                  } as CalendarAttendee)
                : null,
            )
            .filter((x): x is CalendarAttendee => !!x)
        : undefined;

      return {
        id: data.id || id,
        title: data.subject || '',
        description: data.body?.content || undefined,
        start: new Date(startIso),
        end: new Date(endIso),
        timezone: data.start?.timeZone || data.end?.timeZone || undefined,
        attendees,
        location: data.location?.displayName || undefined,
        htmlLink: data.webLink || undefined,
        organizer: data.organizer?.emailAddress?.address || undefined,
        conference: undefined,
      };
    } catch (error) {
      this.logger.warn(this.format({ op: 'getEvent.error', id, error: this.renderError(error) }));
      return null;
    }
  }

  // ===== Helpers =====

  private mapResponseStatus(
    response?: string,
  ): 'needsAction' | 'declined' | 'tentative' | 'accepted' | undefined {
    if (!response) return undefined;
    switch (response.toLowerCase()) {
      case 'accepted':
        return 'accepted';
      case 'declined':
        return 'declined';
      case 'tentativelyaccepted':
        return 'tentative';
      case 'notresponded':
      case 'none':
        return 'needsAction';
      default:
        return undefined;
    }
  }

  private mapAttendees(list: CalendarAttendee[]): any[] {
    return (list ?? [])
      .map((a) =>
        a?.email
          ? {
              emailAddress: {
                address: a.email,
                name: a.name,
              },
              type: a.optional ? 'optional' : 'required',
            }
          : null,
      )
      .filter((x) => !!x);
  }

  private async getAccessToken(): Promise<string> {
    const { accessToken } = await this.getAccessTokenWithId();
    return accessToken;
  }

  private async getAccessTokenWithId(): Promise<{
    accessToken: string;
    credentialId: number;
  }> {
    const { tokens, credentialId } = await this.resolveAccessContext();

    // Check if token is expired
    if (tokens.expires_in && tokens.expires_in < Math.round(Date.now() / 1000)) {
      // Token expired, refresh it
      const newTokens = await this.refreshAccessToken(tokens);
      await this.persistTokens(credentialId, newTokens);
      return { accessToken: newTokens.access_token || '', credentialId };
    }

    return { accessToken: tokens.access_token || '', credentialId };
  }

  private async refreshAccessToken(
    tokens: Office365CalendarTokens,
  ): Promise<Office365CalendarTokens> {
    const { clientId, clientSecret } = await this.getOAuthCredentials();

    if (!tokens.refresh_token) {
      throw new Error('No refresh token available');
    }

    const params = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
      refresh_token: tokens.refresh_token,
      scope: 'User.Read Calendars.Read Calendars.ReadWrite offline_access',
    });

    const response = await fetch(
      'https://login.microsoftonline.com/common/oauth2/v2.0/token',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to refresh token: ${response.statusText} - ${errorText}`);
    }

    const data = (await response.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
      scope?: string;
      token_type?: string;
    };

    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token || tokens.refresh_token,
      expires_in: Math.round(Date.now() / 1000 + data.expires_in),
      scope: data.scope,
      token_type: data.token_type,
      email: tokens.email,
    };
  }

  private async resolveAccessContext(): Promise<{
    tokens: Office365CalendarTokens;
    credentialId: number;
  }> {
    const current = this.currentUser.getCurrentUserSub();
    if (!current) throw new Error('No current user in context');

    const user = await this.prisma.user.findUnique({ where: { sub: current } });
    if (!user) throw new Error('User not found for provided subject');
    const userId = user.id;

    const credential = await this.prisma.credential.findFirst({
      where: { userId, appId: 'office365-calendar', invalid: false },
      orderBy: { createdAt: 'desc' },
    });

    if (!credential) {
      throw new Error('No Office 365 Calendar integration found. Connect your calendar first.');
    }

    const key = this.safeCredentialKey(credential.key as any);
    const tokens: Office365CalendarTokens = {
      access_token: this.getStringField(key, 'access_token'),
      refresh_token: this.getStringField(key, 'refresh_token'),
      expires_in: this.getNumberField(key, 'expires_in'),
      scope: this.getStringField(key, 'scope'),
      token_type: this.getStringField(key, 'token_type'),
      email: this.getStringField(key, 'email'),
    };

    if (!tokens.access_token && !tokens.refresh_token) {
      throw new Error('Office 365 Calendar tokens missing. Reconnect your calendar.');
    }

    return { tokens, credentialId: credential.id };
  }

  private async getOAuthCredentials(): Promise<{ clientId: string; clientSecret: string }> {
    let clientId = process.env.OFFICE365_CLIENT_ID || process.env.MICROSOFT_CLIENT_ID;
    let clientSecret = process.env.OFFICE365_CLIENT_SECRET || process.env.MICROSOFT_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      try {
        const appKeys = (await getAppKeysFromSlug(
          this.prisma as any,
          'office365-calendar',
        )) as Record<string, unknown>;
        if (!clientId && typeof appKeys?.client_id === 'string')
          clientId = appKeys.client_id as string;
        if (!clientSecret && typeof appKeys?.client_secret === 'string')
          clientSecret = appKeys.client_secret as string;
      } catch {
        // ignore
      }
    }

    if (!clientId || !clientSecret) {
      throw new Error('Office 365 Calendar OAuth configuration not found.');
    }

    return { clientId, clientSecret };
  }

  private async persistTokens(
    credentialId: number,
    tokens: Office365CalendarTokens,
  ): Promise<void> {
    const record = await this.prisma.credential.findUnique({ where: { id: credentialId } });
    if (!record) return;

    const key = this.safeCredentialKey(record.key as any);
    const updated: Record<string, any> = { ...key, ...tokens };

    const tokenExpiresAt =
      typeof tokens.expires_in === 'number' ? new Date(tokens.expires_in * 1000) : null;

    await this.prisma.credential.update({
      where: { id: credentialId },
      data: { key: updated as any, tokenExpiresAt },
    });
  }

  private safeCredentialKey(
    key: Record<string, unknown> | null | undefined,
  ): Record<string, unknown> {
    if (key && typeof key === 'object' && !Array.isArray(key))
      return key as Record<string, unknown>;
    return {} as Record<string, unknown>;
  }

  private getStringField(source: Record<string, unknown>, field: string): string | undefined {
    const value = source[field];
    return typeof value === 'string' ? value : undefined;
  }

  private getNumberField(source: Record<string, unknown>, field: string): number | undefined {
    const value = source[field];
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      const n = Number(value);
      return Number.isNaN(n) ? undefined : n;
    }
    return undefined;
  }

  private renderError(error: unknown): string {
    if (error instanceof Error) return `${error.name}: ${error.message}`;
    if (typeof error === 'string') return error;
    return 'Unknown error';
  }

  private format(meta: Record<string, unknown>): string {
    try {
      return JSON.stringify(meta);
    } catch {
      return '[unserializable-meta]';
    }
  }
}
