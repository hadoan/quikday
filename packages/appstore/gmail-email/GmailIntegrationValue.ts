export interface GmailIntegrationValue {
  integrationId: number | null;
  credentialId?: number;
  email: string;
  accessToken: string;
  refreshToken?: string | null;
  expiresAt?: Date | null;
  isConnected: boolean;
}

