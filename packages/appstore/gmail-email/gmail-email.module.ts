import { Module } from '@nestjs/common';
import { GmailEmailService } from './gmail-email.service.js';

@Module({
    providers: [GmailEmailService],
    exports: [GmailEmailService],
})
export class GmailEmailModule { }
