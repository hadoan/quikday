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
import { XhrApi } from '@ewsjs/xhr';
import {
  Appointment,
  Attendee,
  BasePropertySet,
  CalendarView,
  ConflictResolutionMode,
  DateTime,
  DeleteMode,
  ExchangeService,
  Folder,
  FolderId,
  FolderSchema,
  FolderTraversal,
  FolderView,
  ItemId,
  LegacyFreeBusyStatus,
  LogicalOperator,
  MessageBody,
  PropertySet,
  SearchFilter,
  SendInvitationsMode,
  SendInvitationsOrCancellationsMode,
  Uri,
  WebCredentials,
  WellKnownFolderName,
} from 'ews-javascript-api';
import { ExchangeAuthentication } from './types/ExchangeAuthentication.js';
import { ExchangeCalendarCredentials } from './types/ExchangeCalendarCredentials.js';

@Injectable()
export class ExchangeCalendarProviderService implements CalendarService {
  readonly provider = 'outlook' as const;
  private readonly logger = new Logger('ExchangeCalendarProviderService');

  constructor(
    private currentUser: CurrentUserService,
    private prisma: PrismaService,
  ) {}

  async checkAvailability(query: AvailabilityQuery): Promise<AvailabilityResult> {
    this.logger.log(this.format({ op: 'checkAvailability', start: query.start, end: query.end }));
    const service = await this.getExchangeService();

    try {
      const calendarView = new CalendarView(
        DateTime.Parse(query.start.toISOString()),
        DateTime.Parse(query.end.toISOString()),
      );

      const results = await service.FindAppointments(WellKnownFolderName.Calendar, calendarView);

      // Check if any appointments overlap with the query time range
      const busyAppointments = results.Items.filter(
        (apt: Appointment) => apt.LegacyFreeBusyStatus !== LegacyFreeBusyStatus.Free,
      );

      const available = busyAppointments.length === 0;
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
    const service = await this.getExchangeService();

    const appointment = new Appointment(service);
    appointment.Subject = event.title;
    appointment.Start = DateTime.Parse(event.start.toISOString());
    appointment.End = DateTime.Parse(event.end.toISOString());
    appointment.Location = event.location || '';
    appointment.Body = new MessageBody(event.description || '');

    // Add attendees
    if (event.attendees && event.attendees.length > 0) {
      event.attendees.forEach((attendee: CalendarAttendee) => {
        const ewsAttendee = new Attendee(attendee.email);
        if (attendee.optional) {
          appointment.OptionalAttendees.Add(ewsAttendee);
        } else {
          appointment.RequiredAttendees.Add(ewsAttendee);
        }
      });
    }

    try {
      const sendMode =
        event.notifyAttendees === false
          ? SendInvitationsMode.SendToNone
          : SendInvitationsMode.SendToAllAndSaveCopy;
      await appointment.Save(sendMode);

      return {
        id: appointment.Id.UniqueId,
        htmlLink: undefined, // Exchange doesn't provide direct web links
        start: event.start,
        end: event.end,
      };
    } catch (error) {
      this.logger.error(this.format({ op: 'createEvent.error', error: this.renderError(error) }));
      throw new Error(
        error instanceof Error ? error.message : 'Failed to create Exchange Calendar event',
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
    const service = await this.getExchangeService();

    try {
      const calendarView = new CalendarView(
        DateTime.Parse(args.start.toISOString()),
        DateTime.Parse(args.end.toISOString()),
      );

      // Exchange doesn't support pagination tokens like Google Calendar
      // We'll retrieve all events and handle client-side pagination if needed
      const maxResults = Math.min(Math.max(args.pageSize ?? 50, 1), 250);
      calendarView.MaxItemsReturned = maxResults;

      const results = await service.FindAppointments(WellKnownFolderName.Calendar, calendarView);

      const items: CalendarEvent[] = results.Items.map((apt: Appointment) => {
        const attendees: CalendarAttendee[] = [];

        // Add required attendees
        apt.RequiredAttendees.Items.forEach((att) => {
          if (att.Address) {
            attendees.push({
              email: att.Address,
              name: att.Name || undefined,
              optional: false,
              responseStatus: this.mapResponseStatus(att.ResponseType),
            });
          }
        });

        // Add optional attendees
        apt.OptionalAttendees.Items.forEach((att) => {
          if (att.Address) {
            attendees.push({
              email: att.Address,
              name: att.Name || undefined,
              optional: true,
              responseStatus: this.mapResponseStatus(att.ResponseType),
            });
          }
        });

        return {
          id: apt.Id.UniqueId,
          title: apt.Subject || '',
          description: apt.Body?.Text || undefined,
          start: new Date(apt.Start.ToISOString()),
          end: new Date(apt.End.ToISOString()),
          timezone: undefined, // Exchange handles timezone internally
          attendees: attendees.length > 0 ? attendees : undefined,
          location: apt.Location || undefined,
          htmlLink: undefined,
          organizer: apt.Organizer?.Address || undefined,
          conference: undefined,
        } as CalendarEvent;
      });

      return { items };
    } catch (error) {
      this.logger.warn(this.format({ op: 'listEvents.error', error: this.renderError(error) }));
      return { items: [] };
    }
  }

  async updateEvent(id: string, patch: Partial<CalendarEvent>): Promise<CalendarEvent> {
    this.logger.log(this.format({ op: 'updateEvent', id }));
    const service = await this.getExchangeService();

    try {
      const appointment = await Appointment.Bind(service, new ItemId(id));

      // Update fields if provided
      if (typeof patch.title === 'string') appointment.Subject = patch.title;
      if (typeof patch.description === 'string')
        appointment.Body = new MessageBody(patch.description);
      if (typeof patch.location === 'string') appointment.Location = patch.location;
      if (patch.start) appointment.Start = DateTime.Parse(patch.start.toISOString());
      if (patch.end) appointment.End = DateTime.Parse(patch.end.toISOString());

      // Update attendees if provided
      if (Array.isArray(patch.attendees)) {
        appointment.RequiredAttendees.Clear();
        appointment.OptionalAttendees.Clear();

        patch.attendees.forEach((attendee: CalendarAttendee) => {
          const ewsAttendee = new Attendee(attendee.email);
          if (attendee.optional) {
            appointment.OptionalAttendees.Add(ewsAttendee);
          } else {
            appointment.RequiredAttendees.Add(ewsAttendee);
          }
        });
      }

      await appointment.Update(
        ConflictResolutionMode.AlwaysOverwrite,
        SendInvitationsOrCancellationsMode.SendToChangedAndSaveCopy,
      );

      // Fetch updated appointment details
      const attendees: CalendarAttendee[] = [];
      appointment.RequiredAttendees.Items.forEach((att) => {
        if (att.Address) {
          attendees.push({
            email: att.Address,
            name: att.Name || undefined,
            optional: false,
          });
        }
      });
      appointment.OptionalAttendees.Items.forEach((att) => {
        if (att.Address) {
          attendees.push({
            email: att.Address,
            name: att.Name || undefined,
            optional: true,
          });
        }
      });

      return {
        id: appointment.Id.UniqueId,
        title: appointment.Subject || '',
        description: appointment.Body?.Text || undefined,
        start: new Date(appointment.Start.ToISOString()),
        end: new Date(appointment.End.ToISOString()),
        timezone: undefined,
        attendees: attendees.length > 0 ? attendees : undefined,
        location: appointment.Location || undefined,
        htmlLink: undefined,
        organizer: appointment.Organizer?.Address || undefined,
        conference: undefined,
      };
    } catch (error) {
      this.logger.error(
        this.format({ op: 'updateEvent.error', id, error: this.renderError(error) }),
      );
      throw new Error(
        error instanceof Error ? error.message : 'Failed to update Exchange Calendar event',
      );
    }
  }

  async deleteEvent(id: string): Promise<void> {
    this.logger.log(this.format({ op: 'deleteEvent', id }));
    const service = await this.getExchangeService();

    try {
      const appointment = await Appointment.Bind(service, new ItemId(id));
      await appointment.Delete(DeleteMode.MoveToDeletedItems);
    } catch (error) {
      this.logger.error(
        this.format({ op: 'deleteEvent.error', id, error: this.renderError(error) }),
      );
      throw new Error(
        error instanceof Error ? error.message : 'Failed to delete Exchange Calendar event',
      );
    }
  }

  async getEvent(id: string): Promise<CalendarEvent | null> {
    this.logger.log(this.format({ op: 'getEvent', id }));
    const service = await this.getExchangeService();

    try {
      const appointment = await Appointment.Bind(service, new ItemId(id));

      const attendees: CalendarAttendee[] = [];
      appointment.RequiredAttendees.Items.forEach((att) => {
        if (att.Address) {
          attendees.push({
            email: att.Address,
            name: att.Name || undefined,
            optional: false,
          });
        }
      });
      appointment.OptionalAttendees.Items.forEach((att) => {
        if (att.Address) {
          attendees.push({
            email: att.Address,
            name: att.Name || undefined,
            optional: true,
          });
        }
      });

      return {
        id: appointment.Id.UniqueId,
        title: appointment.Subject || '',
        description: appointment.Body?.Text || undefined,
        start: new Date(appointment.Start.ToISOString()),
        end: new Date(appointment.End.ToISOString()),
        timezone: undefined,
        attendees: attendees.length > 0 ? attendees : undefined,
        location: appointment.Location || undefined,
        htmlLink: undefined,
        organizer: appointment.Organizer?.Address || undefined,
        conference: undefined,
      };
    } catch (error) {
      this.logger.warn(this.format({ op: 'getEvent.error', id, error: this.renderError(error) }));
      return null;
    }
  }

  // ===== Helpers =====

  private mapResponseStatus(
    responseType: any,
  ): 'needsAction' | 'declined' | 'tentative' | 'accepted' | undefined {
    // Map Exchange response types to calendar response status
    // ResponseType values: Unknown=0, Organizer=1, Tentative=2, Accept=3, Decline=4, NoResponseReceived=5
    if (!responseType) return undefined;
    const typeNum = typeof responseType === 'number' ? responseType : parseInt(responseType);
    switch (typeNum) {
      case 2:
        return 'tentative';
      case 3:
        return 'accepted';
      case 4:
        return 'declined';
      case 5:
        return 'needsAction';
      default:
        return undefined;
    }
  }

  private async getExchangeService(): Promise<ExchangeService> {
    const credentials = await this.resolveCredentials();

    const service = new ExchangeService(credentials.exchangeVersion);
    service.Credentials = new WebCredentials(credentials.username, credentials.password);
    service.Url = new Uri(credentials.url);

    if (credentials.authenticationMethod === ExchangeAuthentication.NTLM) {
      const xhr = new XhrApi({
        rejectUnauthorized: false,
        gzip: credentials.useCompression,
      }).useNtlmAuthentication(credentials.username, credentials.password);
      service.XHRApi = xhr;
    }

    return service;
  }

  private async resolveCredentials(): Promise<ExchangeCalendarCredentials> {
    const current = this.currentUser.getCurrentUserSub();
    if (!current) throw new Error('No current user in context');

    const user = await this.prisma.user.findUnique({ where: { sub: current } });
    if (!user) throw new Error('User not found for provided subject');
    const userId = user.id;

    const credential = await this.prisma.credential.findFirst({
      where: { userId, appId: 'exchange-calendar', invalid: false },
      orderBy: { createdAt: 'desc' },
    });

    if (!credential) {
      throw new Error('No Exchange Calendar integration found. Connect your calendar first.');
    }

    const key = this.safeCredentialKey(credential.key as any);

    // Validate required fields
    if (!key.url || !key.username || !key.password) {
      throw new Error('Exchange Calendar credentials incomplete. Reconnect your calendar.');
    }

    return {
      url: String(key.url),
      username: String(key.username),
      password: String(key.password),
      authenticationMethod: Number(key.authenticationMethod ?? ExchangeAuthentication.STANDARD),
      exchangeVersion: Number(key.exchangeVersion ?? 7), // Default to Exchange2016
      useCompression: Boolean(key.useCompression ?? false),
    };
  }

  private safeCredentialKey(
    key: Record<string, unknown> | null | undefined,
  ): Record<string, unknown> {
    if (key && typeof key === 'object' && !Array.isArray(key))
      return key as Record<string, unknown>;
    return {} as Record<string, unknown>;
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
