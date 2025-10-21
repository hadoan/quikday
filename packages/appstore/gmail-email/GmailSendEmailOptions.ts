export interface GmailSendEmailOptions {
  to: string[];
  subject: string;
  htmlBody: string;
  cc?: string[];
  bcc?: string[];
  fromName?: string;
  replyToThreadId?: string;
  replyTo?: string;
}
