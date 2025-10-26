import type { EmailService } from './email.service';
import type { EmailProviderId } from './email.types';
export type EmailCtor = new (...args: any[]) => EmailService;
export interface EmailConnection {
    id: string;
    provider: EmailProviderId;
    accessToken?: string;
    refreshToken?: string;
    tenantId?: string;
    meta?: Record<string, any>;
}
export declare class EmailFactory {
    private readonly registry;
    private logger;
    constructor(registry: Map<EmailProviderId, EmailCtor>);
    /**
     * Build a provider-specific EmailService instance from a connection snapshot.
     * Scope tokens here; do NOT share across requests.
     */
    createFromConnection(conn: EmailConnection): EmailService;
}
