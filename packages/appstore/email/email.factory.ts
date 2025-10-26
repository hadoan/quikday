import { Inject, Injectable, Logger } from '@nestjs/common';
import { EMAIL_REGISTRY } from './email.tokens.js';
import type { EmailService } from './email.service.js';
import type { EmailProviderId } from './email.types.js';

export type EmailCtor = new (...args: any[]) => EmailService;

export interface EmailConnection {
    id: string;                 // connectionId
    provider: EmailProviderId;  // 'gmail' | 'outlook'
    // token payloads (encrypted at rest):
    accessToken?: string;
    refreshToken?: string;
    tenantId?: string;          // for Outlook
    meta?: Record<string, any>;
}

@Injectable()
export class EmailFactory {
    private logger = new Logger(EmailFactory.name);
    constructor(
        @Inject(EMAIL_REGISTRY) private readonly registry: Map<EmailProviderId, EmailCtor>,
    ) { }

    /**
     * Build a provider-specific EmailService instance from a connection snapshot.
     * Scope tokens here; do NOT share across requests.
     */
    createFromConnection(conn: EmailConnection): EmailService {
        const Ctor = this.registry.get(conn.provider);
        if (!Ctor) {
            this.logger.error(`No EmailService registered for provider=${conn.provider}`);
            throw new Error(`Unsupported provider: ${conn.provider}`);
        }
        // Each provider’s constructor should accept a minimal creds bag
        // to keep DI clean (no SDKs leaking into domain).
        return new Ctor(conn);
    }
}
