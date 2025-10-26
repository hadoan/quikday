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
import { CurrentUserService } from "@quikday/libs";
import { PrismaService } from '@quikday/prisma';
import { getAppKeysFromSlug } from '@quikday/appstore';

export class GmailEmailService implements EmailService {
    readonly provider = 'gmail' as const;

    constructor(private currentUserService: CurrentUserService, private prismaService: PrismaService) {
        // conn.accessToken / refreshToken used by an internal Gmail client
    }

    getCapabilities(): ProviderCapabilities {
        return { scheduleSend: true, snooze: true, labels: true, threads: true };
    }

    async getThread(threadId: string): Promise<EmailMessage[]> {
        // 1) call Gmail API threads.get
        // 2) map to EmailMessage[]
        return [];
    }

    async getMessage(messageId: string): Promise<EmailMessage> {
        // messages.get → map
        return { id: messageId, threadId: 't', subject: '', from: { address: '' }, to: [], date: new Date() };
    }

    async search(q: SearchQuery) {
        // build Gmail query (e.g., newer_than, label, from, to, text)
        // list messages and hydrate minimal fields
        return { messages: [], nextPageToken: undefined };
    }

    async createDraft(draft: DraftInput) {
        // drafts.create → return draftId, threadId?
        return { draftId: 'draft_123', threadId: undefined };
    }

    async send(draft: DraftInput, opts?: SendOptions) {
        const currentUserId = this.currentUserService.getCurrentUserId();
        if (!currentUserId) throw new Error('No current user in context');
        const userId = Number(currentUserId);
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
        let accessToken = this.getStringField(key, 'access_token') ?? this.getStringField(key, 'accessToken');
        const refreshToken = this.getStringField(key, 'refresh_token') ?? this.getStringField(key, 'refreshToken');
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

        const htmlBody = (draft.html && draft.html.trim().length > 0)
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
        // drafts.send (with optional schedule)
        return { messageId: 'msg_456', threadId: 'thr_123' };
    }

    async changeLabels(target: { threadId?: string; messageId?: string }, delta: LabelChange) {
        // threads.modify / messages.modify
    }

    async archive(target: { threadId?: string; messageId?: string }) {
        // modify: remove INBOX label
    }

    async snooze(target: { threadId?: string; messageId?: string }, until: Date) {
        // add SNOOZED label + Gmail snooze metadata header (or Move to Snoozed w/ date)
    }


    // ===== Helpers (ported from GmailManager) =====
    private mapAddresses(addrs: EmailAddress[]): string[] {
        return (addrs ?? []).map((a) => a?.address).filter((x): x is string => typeof x === 'string' && x.length > 0);
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

    private async getOAuthCredentials(): Promise<OAuthCredentials> {
        let clientId = process.env.GMAIL_CLIENT_ID;
        let clientSecret = process.env.GMAIL_CLIENT_SECRET;

        if (!clientId || !clientSecret) {
            try {
                const appKeys = (await getAppKeysFromSlug(this.prismaService as any, 'gmail-email')) as Record<string, unknown>;
                if (!clientId && typeof appKeys?.client_id === 'string') clientId = appKeys.client_id as string;
                if (!clientSecret && typeof appKeys?.client_secret === 'string') clientSecret = appKeys.client_secret as string;
            } catch (_) {
                // ignore
            }
        }

        if (!clientId || !clientSecret) {
            throw new Error('Gmail OAuth configuration not found. Provide clientId and clientSecret.');
        }

        return { clientId, clientSecret };
    }

    private async refreshAccessToken(credentialId: number, refreshToken?: string | null): Promise<string> {
        if (!refreshToken) {
            // fetch latest credential to read refresh token
            const cred = await this.prismaService.credential.findUnique({ where: { id: credentialId } });
            if (!cred) throw new Error('Gmail credential not found. Reconnect your Gmail account.');
            const key = this.safeCredentialKey(cred.key as any);
            refreshToken = this.getStringField(key, 'refresh_token') ?? this.getStringField(key, 'refreshToken');
            if (!refreshToken) throw new Error('Gmail refresh token not found. Reconnect your Gmail account.');
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

    private async sendEmailViaGmailApi(userId: string, rawMessage: string, accessToken: string): Promise<GmailSendResponse> {
        const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/${encodeURIComponent(userId)}/messages/send`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ raw: rawMessage }),
        });

        if (!response.ok) {
            const errorContent = await response.text();
            if (response.status === 401) {
                throw new Error('Gmail access token has expired or is invalid. Reconnect your Gmail account.');
            }
            throw new Error(`Failed to send email via Gmail API: ${response.status} - ${errorContent}`);
        }

        const payload = (await response.json()) as Record<string, unknown>;
        const messageId = (typeof payload.id === 'string' ? payload.id : undefined) ?? '';
        const threadId = (typeof payload.threadId === 'string' ? payload.threadId : undefined) ?? '';
        return { success: true, messageId, threadId };
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
