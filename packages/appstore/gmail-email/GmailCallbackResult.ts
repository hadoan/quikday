import { GmailTokens } from './GmailTokens.js';

export interface GmailCallbackResult {
  tokens: GmailTokens;
  raw: any;
  success: boolean;
}
