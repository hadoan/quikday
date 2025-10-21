/* Google Calendar Integration */
import type { AppMeta } from '@quikday/types';
import type { calendar_v3 } from 'googleapis';

import GoogleCalendarService, {
  type CreateGoogleCalendarEventOptions,
} from './lib/CalendarService.js';
import { resolveGoogleCalendarAuthUrl } from './add.js';
import { callback } from './callback.js';

// Export calendar tool for agent use
export * from './tool.js';

export default function createApp(meta: AppMeta, deps: any) {
  return new (class GoogleCalendarApp {
    readonly calendarService: GoogleCalendarService;

    constructor(
      public readonly meta: AppMeta,
      public readonly deps: any,
    ) {
      console.log('📅 Google Calendar app initialized', { slug: meta.slug });
      this.calendarService = new GoogleCalendarService({
        prisma: deps?.prisma,
      });
    }

    /**
     * Initiate OAuth flow
     * Called when user clicks "Install" on Google Calendar
     * Route: GET /integrations/google-calendar/add
     */
    async add(req: any, res: any) {
      try {
        console.log('📅 [Add] Initiating OAuth flow', {
          slug: meta.slug,
          userId: req?.user?.id || req?.user?.sub,
        });

        // Create signed state if state utility is available via deps
        let signedState: string | undefined;
        if (typeof this.deps?.createSignedState === 'function') {
          try {
            const userId = req?.user?.id || req?.user?.sub;
            if (userId) {
              signedState = this.deps.createSignedState({
                userId,
                timestamp: Date.now(),
                returnTo: req.query?.returnTo as string | undefined,
              });
              console.log('📅 [Add] Created signed state via deps', {
                hasSignedState: !!signedState,
                userId,
              });
            }
          } catch (stateError) {
            console.warn('📅 [Add] Failed to create signed state', {
              error: stateError instanceof Error ? stateError.message : 'Unknown',
            });
            // Fallback: library will create unsigned state
          }
        } else {
          console.warn(
            '📅 [Add] No createSignedState function in deps, using unsigned state fallback',
          );
        }

        // Delegate all logic to add.ts helper
        const { url } = await resolveGoogleCalendarAuthUrl({
          req,
          meta,
          signedState,
        });

        console.log('📅 [Add] OAuth URL generated, redirecting user', {
          hasUrl: !!url,
        });

        // If client requested JSON (e.g., to attach Authorization header), return the URL
        const acceptsJson =
          (req.headers['accept'] || '').includes('application/json') ||
          req.query?.format === 'json';
        if (acceptsJson) {
          return res.status(200).json({ url });
        }

        res.redirect(url);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('📅 [Add] Failed to initiate OAuth flow', {
          error: message,
          stack: error instanceof Error ? error.stack : undefined,
        });
        res.status(500).json({ error: 'Failed to initiate OAuth flow', message });
      }
    }

    async callback(req: any, res: any) {
      console.log('📅 [Callback] Handling OAuth callback', {
        slug: meta.slug,
        hasCode: !!req.query?.code,
        hasError: !!req.query?.error,
      });

      try {
        const { redirectTo } = await callback({
          req,
          meta,
          prisma: this.deps.prisma,
        });

        console.log('📅 [Callback] OAuth callback completed, redirecting', {
          redirectTo,
        });

        return res.redirect(redirectTo);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('📅 [Callback] OAuth callback failed', {
          error: message,
          stack: error instanceof Error ? error.stack : undefined,
        });
        return res.status(500).json({ error: 'Failed to complete OAuth callback', message });
      }
    }

    async post(req: any, res: any) {
      console.log('📅 [Post] Received POST request', {
        slug: meta.slug,
        hasBody: !!req?.body,
      });

      const body = req?.body;

      if (!body || typeof body !== 'object') {
        console.warn('📅 [Post] Invalid request body', {
          bodyType: typeof body,
        });
        return res.status(400).json({ message: 'Invalid body' });
      }

      try {
        const userId = await this.resolveUserId(req);

        const {
          calendarId,
          timeZone,
          sendUpdates,
          reminders,
          userId: _bodyUserId,
          teamId: _bodyTeamId,
          ...eventPayload
        } = body as Record<string, unknown>;

        const payload = {
          ...(eventPayload as Record<string, unknown>),
        } as unknown as CreateGoogleCalendarEventOptions;

        const normalizedCalendarId =
          typeof calendarId === 'string' && calendarId.trim().length
            ? calendarId.trim()
            : undefined;
        if (normalizedCalendarId) {
          payload.calendarId = normalizedCalendarId;
        }

        const normalizedTimeZone =
          typeof timeZone === 'string' && timeZone.trim().length
            ? timeZone.trim()
            : undefined;
        if (normalizedTimeZone) {
          payload.timeZone = normalizedTimeZone;
        }

        if (
          typeof sendUpdates === 'string' &&
          ['all', 'externalOnly', 'none'].includes(sendUpdates)
        ) {
          payload.sendUpdates = sendUpdates as 'all' | 'externalOnly' | 'none';
        }

        const normalizedReminders = this.normalizeReminders(reminders);
        if (normalizedReminders) {
          payload.reminders = normalizedReminders;
        }

        const result = await this.calendarService.createCalendarEvent(userId, payload);

        if (!result.success) {
          console.warn('📅 [Post] Google Calendar event creation failed', {
            slug: meta.slug,
            message: result.message,
          });
          return res.status(400).json({ ok: false, ...result });
        }

        console.log('📅 [Post] Google Calendar event created', {
          slug: meta.slug,
          eventId: result.eventId,
          startIso: result.startIso,
          endIso: result.endIso,
        });

        return res.status(200).json({ ok: true, ...result });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('📅 [Post] Failed to create Google Calendar event', {
          slug: meta.slug,
          error: message,
          stack: error instanceof Error ? error.stack : undefined,
        });
        return res.status(500).json({ ok: false, message });
      }
    }

    async resolveUserId(req: any): Promise<number> {
      const prisma = this.deps?.prisma;
      if (!prisma) {
        throw new Error('Prisma dependency not available for Google Calendar integration');
      }

      const user = req?.user;
      if (!user) {
        throw new Error('Authenticated user context is required');
      }

      if (typeof user.id === 'number') {
        return user.id;
      }

      const sub = typeof user.sub === 'string' ? user.sub : undefined;
      if (!sub) {
        throw new Error('Authenticated user is missing a subject identifier');
      }

      const email = typeof user.email === 'string' ? user.email : undefined;
      const displayName = typeof user.name === 'string' ? user.name : undefined;

      const updateData: any = { lastLoginAt: new Date() };
      if (email) updateData.email = email;
      if (displayName) updateData.displayName = displayName;

      const createData: any = {
        sub,
        email: email ?? null,
        displayName: displayName ?? null,
      };

      const record = await prisma.user.upsert({
        where: { sub },
        update: updateData,
        create: createData,
      });

      if (!record?.id) {
        throw new Error('Failed to resolve a user record for the authenticated principal');
      }

      return record.id;
    }

    normalizeReminders(
      value: unknown,
    ): calendar_v3.Schema$Event['reminders'] | undefined {
      if (!value || typeof value !== 'object') {
        return undefined;
      }

      const record = value as Record<string, unknown>;
      const normalized: calendar_v3.Schema$Event['reminders'] = {};

      if (typeof record.useDefault === 'boolean') {
        normalized.useDefault = record.useDefault;
      }

      if (Array.isArray(record.overrides)) {
        const overrides = record.overrides
          .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
          .map((item) => {
            const reminder: calendar_v3.Schema$EventReminder = {};
            if (typeof item.method === 'string' && item.method.trim().length) {
              reminder.method = item.method.trim();
            }
            if (typeof item.minutes === 'number' && Number.isFinite(item.minutes)) {
              reminder.minutes = Math.trunc(item.minutes);
            }
            return reminder;
          })
          .filter((item) => Object.keys(item).length > 0);

        if (overrides.length > 0) {
          normalized.overrides = overrides;
        }
      }

      return Object.keys(normalized).length > 0 ? normalized : undefined;
    }
  })(meta, deps);
}
