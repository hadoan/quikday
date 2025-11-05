import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@quikday/prisma';
import { getAppKeysFromSlug } from '@quikday/appstore';
import * as hubspot from '@hubspot/api-client';

type HubspotTokens = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
  expiry_date?: number; // epoch ms
};

@Injectable()
export class HubspotCrmService {
  private readonly logger = new Logger(HubspotCrmService.name);
  private readonly slug = 'hubspot-crm';

  constructor(private readonly prisma: PrismaService) {}

  private async getOAuthClient() {
    const appKeys = (await getAppKeysFromSlug(this.prisma, this.slug)) as Record<string, unknown>;
    const clientId = typeof appKeys?.client_id === 'string' ? appKeys.client_id : undefined;
    const clientSecret = typeof appKeys?.client_secret === 'string' ? appKeys.client_secret : undefined;
    if (!clientId) throw new Error('HubSpot client_id missing');
    if (!clientSecret) throw new Error('HubSpot client_secret missing');
    return { clientId, clientSecret };
  }

  private isExpired(expiryDate?: number, bufferMs = 5 * 60 * 1000) {
    if (!expiryDate) return true;
    return Date.now() >= expiryDate - bufferMs;
  }

  private async getClientForUser(userId: number) {
    const cred = await this.prisma.credential.findFirst({
      where: { userId, appId: this.slug },
    });
    if (!cred) throw new Error('No HubSpot credential found for user');
    const tokens = (cred.key as any) as HubspotTokens;
    const { clientId, clientSecret } = await this.getOAuthClient();

    const hs = new hubspot.Client();

    // Refresh if needed
    if (this.isExpired(tokens.expiry_date) && tokens.refresh_token) {
      try {
        const baseUrl = process.env.API_BASE_URL || 'http://localhost:3000';
        const redirectUri = `${baseUrl}/integrations/${this.slug}/callback`;
        const resp = await hs.oauth.tokensApi.create(
          'refresh_token',
          undefined,
          redirectUri,
          clientId,
          clientSecret,
          tokens.refresh_token,
        );
        const refreshed: HubspotTokens = {
          access_token: (resp as any)?.accessToken,
          refresh_token: (resp as any)?.refreshToken || tokens.refresh_token,
          expires_in: (resp as any)?.expiresIn,
          token_type: (resp as any)?.tokenType,
          scope: (resp as any)?.scope,
        };
        if (typeof refreshed.expires_in === 'number') {
          refreshed.expiry_date = Date.now() + refreshed.expires_in * 1000;
        }
        await this.prisma.credential.update({
          where: { id: cred.id },
          data: { key: (refreshed as any) },
        });
        hs.setAccessToken(refreshed.access_token!);
        return hs;
      } catch (e) {
        this.logger.error('Failed refreshing HubSpot token', e as any);
      }
    }

    if (!tokens.access_token) throw new Error('Missing HubSpot access token');
    hs.setAccessToken(tokens.access_token);
    return hs;
  }

  // Contacts
  async findContactsByEmails(userId: number, emails: string[]): Promise<Array<{ id: string; email: string }>> {
    const hs = await this.getClientForUser(userId);
    const results: Array<{ id: string; email: string }> = [];
    for (const email of emails) {
      const resp = await hs.crm.contacts.searchApi.doSearch({
        filterGroups: [
          {
            filters: [
              {
                value: email,
                propertyName: 'email',
                operator: 'EQ',
              },
            ],
          },
        ],
        sorts: ['hs_object_id'],
        properties: ['hs_object_id', 'email'],
        limit: 1,
        after: 0,
      } as any);
      for (const c of resp.results ?? []) {
        results.push({ id: c.id as string, email: (c as any)?.properties?.email as string });
      }
    }
    return results;
  }

  async createContacts(userId: number, contacts: Array<{ email: string; name?: string }>) {
    const hs = await this.getClientForUser(userId);
    const created: Array<{ id: string; email: string }> = [];
    for (const c of contacts) {
      const [firstname, lastname] = c.name ? c.name.split(' ') : [c.email, ''];
      try {
        const resp = await hs.crm.contacts.basicApi.create({
          properties: { firstname, lastname, email: c.email },
        } as any);
        created.push({ id: resp.id as string, email: c.email });
      } catch (err: any) {
        const msg: string = err?.body?.message || '';
        if (msg.includes('Contact already exists. Existing ID:')) {
          const id = msg.split('Contact already exists. Existing ID: ')[1];
          created.push({ id, email: c.email });
        } else {
          throw err;
        }
      }
    }
    return created;
  }

  // Meetings (basic helpers)
  async createMeeting(userId: number, meeting: {
    title: string;
    startTime: string | Date;
    endTime: string | Date;
    location?: string;
    body?: string;
    contactIds?: string[];
  }): Promise<{ id: string }> {
    const hs = await this.getClientForUser(userId);
    const resp = await hs.crm.objects.meetings.basicApi.create({
      properties: {
        hs_timestamp: Date.now().toString(),
        hs_meeting_title: meeting.title,
        hs_meeting_body: meeting.body || '',
        hs_meeting_location: meeting.location || '',
        hs_meeting_start_time: new Date(meeting.startTime).toISOString(),
        hs_meeting_end_time: new Date(meeting.endTime).toISOString(),
        hs_meeting_outcome: 'SCHEDULED',
      },
    } as any);

    if (meeting.contactIds && meeting.contactIds.length > 0) {
      await hs.crm.associations.batchApi.create('meetings', 'contacts', {
        inputs: meeting.contactIds.map((id) => ({
          _from: { id: resp.id as string },
          to: { id },
          type: 'meeting_event_to_contact',
        })),
      } as any);
    }
    return { id: resp.id as string };
  }

  async updateMeeting(userId: number, meetingId: string, patch: Partial<{
    title: string;
    startTime: string | Date;
    endTime: string | Date;
    location: string;
    body: string;
    outcome: 'SCHEDULED' | 'RESCHEDULED' | 'CANCELED' | 'NO_SHOW';
  }>) {
    const hs = await this.getClientForUser(userId);
    const properties: Record<string, string> = { hs_timestamp: Date.now().toString() };
    if (patch.title) properties['hs_meeting_title'] = patch.title;
    if (patch.body) properties['hs_meeting_body'] = patch.body;
    if (patch.location) properties['hs_meeting_location'] = patch.location;
    if (patch.startTime) properties['hs_meeting_start_time'] = new Date(patch.startTime).toISOString();
    if (patch.endTime) properties['hs_meeting_end_time'] = new Date(patch.endTime).toISOString();
    if (patch.outcome) properties['hs_meeting_outcome'] = patch.outcome;
    return hs.crm.objects.meetings.basicApi.update(meetingId, { properties } as any);
  }
}
