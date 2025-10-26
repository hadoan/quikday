import { ProviderCapabilities, EmailMessage, SearchQuery, DraftInput, SendOptions, LabelChange } from "./email.types";
export interface EmailService {
    readonly provider: 'gmail' | 'outlook';
    getCapabilities(): ProviderCapabilities;
    getThread(threadId: string): Promise<EmailMessage[]>;
    getMessage(messageId: string): Promise<EmailMessage>;
    search(q: SearchQuery): Promise<{
        messages: EmailMessage[];
        nextPageToken?: string;
    }>;
    createDraft(draft: DraftInput): Promise<{
        draftId: string;
        threadId?: string;
    }>;
    send(draft: DraftInput, opts?: SendOptions): Promise<{
        messageId: string;
        threadId: string;
    }>;
    sendExistingDraft(draftId: string, opts?: SendOptions): Promise<{
        messageId: string;
        threadId: string;
    }>;
    changeLabels(target: {
        threadId?: string;
        messageId?: string;
    }, delta: LabelChange): Promise<void>;
    archive(target: {
        threadId?: string;
        messageId?: string;
    }): Promise<void>;
    snooze?(target: {
        threadId?: string;
        messageId?: string;
    }, until: Date): Promise<void>;
}
