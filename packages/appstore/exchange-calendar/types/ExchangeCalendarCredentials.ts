export interface ExchangeCalendarCredentials {
  /** Exchange server URL */
  url: string;
  /** Exchange email address/username */
  username: string;
  /** Exchange password (encrypted when stored) */
  password: string;
  /** Authentication method (0=Standard, 1=NTLM) */
  authenticationMethod: number;
  /** Exchange server version */
  exchangeVersion: number;
  /** Enable compression for requests */
  useCompression: boolean;
}
