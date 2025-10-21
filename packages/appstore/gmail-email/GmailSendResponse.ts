export interface GmailSendResponse {
  success: boolean;
  messageId?: string;
  threadId?: string;
  gmailUrl?: string | null;
  errorMessage?: string;
}

