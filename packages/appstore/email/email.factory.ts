import { Inject, Injectable, Logger } from '@nestjs/common';
import { EMAIL_REGISTRY } from './email.tokens.js';
import type { EmailService } from './email.service.js';
import type { EmailProviderId } from './email.types.js';
import { CurrentUserService } from '@quikday/libs';
import { PrismaService } from '@quikday/prisma';

export type EmailCtor = new (
  currentUser: CurrentUserService,
  prisma: PrismaService,
) => EmailService;

export interface EmailFactoryDeps {
  currentUser: CurrentUserService;
  prisma: PrismaService;
}

@Injectable()
export class EmailFactory {
  private logger = new Logger(EmailFactory.name);
  constructor(@Inject(EMAIL_REGISTRY) private readonly registry: Map<EmailProviderId, EmailCtor>) {}

  create(provider: EmailProviderId, deps: EmailFactoryDeps): EmailService {
    const Ctor = this.registry.get(provider);
    if (!Ctor) {
      this.logger.error(`No EmailService registered for provider=${provider}`);
      throw new Error(`Unsupported provider: ${provider}`);
    }
    return new Ctor(deps.currentUser, deps.prisma);
  }
}
