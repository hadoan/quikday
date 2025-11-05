export type EmailProviderId = 'gmail' | 'outlook';

export type MessageId = string;
export type ThreadId = string;
export type LabelId = string;

export type EmailAddress = { name?: string; address: string };

export type EmailMessage = {
  id: MessageId;
  threadId: ThreadId;
  subject: string;
  from: EmailAddress;
  to: EmailAddress[];
  cc?: EmailAddress[];
  bcc?: EmailAddress[];
  date: Date;
  snippet?: string;
  bodyHtml?: string;
  bodyText?: string;
  labels?: string[]; // human labels
  providerLabels?: string[]; // provider-native ids
  headers?: Record<string, string>;
};

export type SearchQuery = {
  text?: string;
  from?: string;
  to?: string;
  newerThan?: Date;
  olderThan?: Date;
  label?: string;
  limit?: number;
  pageToken?: string;
};

export type DraftInput = {
  subject: string;
  from?: EmailAddress;
  to: EmailAddress[];
  cc?: EmailAddress[];
  bcc?: EmailAddress[];
  html?: string;
  text?: string;
  attachments?: Array<{ filename: string; mime: string; dataBase64: string }>;
  replyToMessageId?: MessageId; // reply in-thread when present
};

export type SendOptions = {
  scheduleAt?: Date; // if supported by provider
  requestIdempotencyKey?: string;
  // For replying within an existing conversation (provider-supported)
  threadId?: ThreadId;
};

export type LabelChange = {
  add?: string[]; // human labels (we’ll map)
  remove?: string[];
};

export type ProviderCapabilities = {
  scheduleSend: boolean;
  snooze: boolean;
  labels: boolean;
  threads: boolean;
};
