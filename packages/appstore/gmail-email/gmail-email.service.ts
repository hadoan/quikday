import type { EmailService } from '@quikday/appstore/email/email.service';
import type {
    ProviderCapabilities,
    EmailMessage,
    SearchQuery,
    DraftInput,
    SendOptions,
    LabelChange,
} from '@quikday/appstore/email/email.types';
import type { EmailConnection } from '@quikday/appstore/email/email.factory';

export class GmailEmailService implements EmailService {
    readonly provider = 'gmail' as const;

    constructor(private readonly conn: EmailConnection) {
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
        // if opts.scheduleAt → use Gmail schedule send (SendAs w/ schedule)
        // else messages.send
        return { messageId: 'msg_123', threadId: 'thr_123' };
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
}
