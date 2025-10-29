import { Injectable, Logger } from '@nestjs/common';
import type { CalendarService } from '@quikday/appstore/calendar/calendar.service';
import type {
  AvailabilityQuery,
  AvailabilityResult,
  CalendarEvent,
  CalendarAttendee,
} from '@quikday/appstore/calendar/calendar.types';
import { CurrentUserService, getCurrentUserCtx } from '@quikday/libs';
import { PrismaService } from '@quikday/prisma';
import { getAppKeysFromSlug } from '@quikday/appstore';
import { google, type calendar_v3 } from 'googleapis';

@Injectable()
export class GoogleCalendarProviderService implements CalendarService {
  readonly provider = 'google' as const;
  private readonly logger = new Logger('GoogleCalendarProviderService');

  constructor(
    private currentUser: CurrentUserService,
    private prisma: PrismaService,
  ) { }

  async checkAvailability(query: AvailabilityQuery): Promise<AvailabilityResult> {
    this.logger.log(this.format({ op: 'checkAvailability', start: query.start, end: query.end }));
    const { calendar } = await this.getGoogleClient(this.prisma, this.currentUser);
    try {
      const resp = await calendar.freebusy.query({
        requestBody: {
          timeMin: query.start.toISOString(),
          timeMax: query.end.toISOString(),
          items: [{ id: 'primary' }],
        },
      });
      const busy = resp.data?.calendars?.primary?.busy ?? [];
      const available = !Array.isArray(busy) || busy.length === 0;
      return { available, start: query.start, end: query.end, attendees: query.attendees };
    } catch (error) {
      this.logger.warn(
        this.format({ op: 'checkAvailability.error', error: this.renderError(error) }),
      );
      // On errors, default to available=false to be safe
      return { available: false, start: query.start, end: query.end, attendees: query.attendees };
    }
  }

  async createEvent(
    event: Omit<CalendarEvent, 'id'> & { notifyAttendees?: boolean },
  ): Promise<{ id: string; htmlLink?: string; start: Date; end: Date }> {
    this.logger.log(this.format({ op: 'createEvent', title: event.title }));
    const { calendar, credentialId, oauth2Client } = await this.getGoogleClient(this.prisma, this.currentUser);

    const attendees = this.mapAttendees(event.attendees ?? []);
    const sendUpdates: 'all' | 'none' = event.notifyAttendees === false ? 'none' : 'all';
    const startIso = event.start.toISOString();
    const endIso = event.end.toISOString();

    try {
      const resp = await calendar.events.insert({
        calendarId: 'primary',
        sendUpdates,
        requestBody: {
          summary: event.title,
          description: event.description,
          location: event.location,
          start: { dateTime: startIso, timeZone: event.timezone },
          end: { dateTime: endIso, timeZone: event.timezone },
          attendees: attendees.length ? attendees : undefined,
          conferenceData: undefined,
        },
      });

      // Persist any refreshed tokens
      await this.persistTokensIfChanged(credentialId, oauth2Client);

      const ev = resp.data;
      const id = typeof ev?.id === 'string' ? ev.id : '';
      const htmlLink = typeof ev?.htmlLink === 'string' ? ev.htmlLink : undefined;
      return { id, htmlLink, start: event.start, end: event.end };
    } catch (error) {
      this.logger.error(this.format({ op: 'createEvent.error', error: this.renderError(error) }));
      throw new Error(
        error instanceof Error ? error.message : 'Failed to create Google Calendar event',
      );
    }
  }

  async getEvent(id: string): Promise<CalendarEvent | null> {
    this.logger.log(this.format({ op: 'getEvent', id }));
    const { calendar } = await this.getGoogleClient(this.prisma, this.currentUser);
    try {
      const resp = await calendar.events.get({ calendarId: 'primary', eventId: id });
      const data = resp.data;
      if (!data) return null;
      const startIso = data.start?.dateTime || data.start?.date;
      const endIso = data.end?.dateTime || data.end?.date;
      const attendees = Array.isArray(data.attendees)
        ? data.attendees
          .map((a) =>
            a?.email
              ? ({ email: a.email!, name: a.displayName ?? undefined } as CalendarAttendee)
              : null,
          )
          .filter((x): x is CalendarAttendee => !!x)
        : undefined;
      return {
        id: data.id || id,
        title: data.summary || '',
        description: data.description || undefined,
        start: startIso ? new Date(startIso) : new Date(),
        end: endIso ? new Date(endIso) : new Date(),
        timezone: data.start?.timeZone || data.end?.timeZone || undefined,
        attendees,
        location: data.location || undefined,
        htmlLink: data.htmlLink || undefined,
        organizer: data.organizer?.email || undefined,
        conference: undefined,
      };
    } catch (error) {
      this.logger.warn(this.format({ op: 'getEvent.error', id, error: this.renderError(error) }));
      return null;
    }
  }

  // ===== Helpers =====
  private mapAttendees(list: CalendarAttendee[]): calendar_v3.Schema$EventAttendee[] {
    return (list ?? [])
      .map((a) =>
        a?.email
          ? ({
            email: a.email,
            displayName: a.name,
            optional: a.optional,
          } as calendar_v3.Schema$EventAttendee)
          : null,
      )
      .filter((x): x is calendar_v3.Schema$EventAttendee => !!x);
  }

  private async getGoogleClient(
    prisma: PrismaService,
    currentUser: CurrentUserService,
  ): Promise<{
    calendar: calendar_v3.Calendar;
    oauth2Client: any;
    credentialId: number;
  }> {
    const { accessToken, refreshToken, expiryDate, credentialId } =
      await this.resolveAccessContext(prisma, currentUser);
    const { clientId, clientSecret } = await this.getOAuthCredentials();
    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
    oauth2Client.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken ?? undefined,
      expiry_date: expiryDate,
    });
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    return { calendar, oauth2Client, credentialId };
  }

  private async resolveAccessContext(prisma: PrismaService, currentUser: CurrentUserService): Promise<{
    accessToken: string;
    refreshToken?: string | null;
    expiryDate?: number;
    credentialId: number;
  }> {
    // Pull from ALS first to avoid undefined when invoked from background jobs
    const current = currentUser.getCurrentUserId();
    if (!current) throw new Error('No current user in context');
    let userId: number | null = null;
    if (/^\d+$/.test(current)) {
      userId = Number(current);
    } else {
      const user = await prisma.user.findUnique({ where: { sub: current } });
      if (!user) throw new Error('User not found for provided subject');
      userId = user.id;
    }

    const credential = await prisma.credential.findFirst({
      where: { userId, appId: 'google-calendar', invalid: false },
      orderBy: { createdAt: 'desc' },
    });
    if (!credential)
      throw new Error('No Google Calendar integration found. Connect your calendar first.');

    const key = this.safeCredentialKey(credential.key as any);
    const accessToken =
      this.getStringField(key, 'access_token') ?? this.getStringField(key, 'accessToken') ?? '';
    const refreshToken =
      this.getStringField(key, 'refresh_token') ?? this.getStringField(key, 'refreshToken');
    const expiryDate =
      this.getNumberField(key, 'expiry_date') ?? credential.tokenExpiresAt?.getTime();
    if (!accessToken && !refreshToken)
      throw new Error('Google Calendar tokens missing. Reconnect your calendar.');
    return { accessToken, refreshToken, expiryDate, credentialId: credential.id };
  }

  private async getOAuthCredentials(): Promise<{ clientId: string; clientSecret: string }> {
    let clientId =
      process.env.GOOGLE_CALENDAR_CLIENT_ID ||
      process.env.GOOGLE_CLIENT_ID ||
      process.env.GCAL_CLIENT_ID;
    let clientSecret =
      process.env.GOOGLE_CALENDAR_CLIENT_SECRET ||
      process.env.GOOGLE_CLIENT_SECRET ||
      process.env.GCAL_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      try {
        const appKeys = (await getAppKeysFromSlug(this.prisma as any, 'google-calendar')) as Record<
          string,
          unknown
        >;
        if (!clientId && typeof appKeys?.client_id === 'string')
          clientId = appKeys.client_id as string;
        if (!clientSecret && typeof appKeys?.client_secret === 'string')
          clientSecret = appKeys.client_secret as string;
      } catch {
        // ignore
      }
    }
    if (!clientId || !clientSecret)
      throw new Error('Google Calendar OAuth configuration not found.');
    return { clientId, clientSecret };
  }

  private async persistTokensIfChanged(credentialId: number, oauth2Client: any): Promise<void> {
    const creds = oauth2Client?.credentials as
      | { access_token?: string; refresh_token?: string; expiry_date?: number }
      | undefined;
    if (!creds) return;
    const record = await this.prisma.credential.findUnique({ where: { id: credentialId } });
    if (!record) return;
    const key = this.safeCredentialKey(record.key as any);
    const updated: Record<string, any> = { ...key };
    let changed = false;
    if (creds.access_token && updated.access_token !== creds.access_token) {
      updated.access_token = creds.access_token;
      changed = true;
    }
    if (creds.refresh_token && updated.refresh_token !== creds.refresh_token) {
      updated.refresh_token = creds.refresh_token;
      changed = true;
    }
    if (typeof creds.expiry_date === 'number' && updated.expiry_date !== creds.expiry_date) {
      updated.expiry_date = creds.expiry_date;
      changed = true;
    }
    const tokenExpiresAt =
      typeof creds.expiry_date === 'number' ? new Date(creds.expiry_date) : record.tokenExpiresAt;
    if (changed) {
      await this.prisma.credential.update({
        where: { id: credentialId },
        data: { key: updated as any, tokenExpiresAt },
      });
    }
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
