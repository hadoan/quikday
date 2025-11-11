export interface ExchangeCalendarAuthConfig {
  /** Exchange server URL (e.g., https://outlook.office365.com/EWS/Exchange.asmx) */
  url: string;
  /** Exchange email address/username */
  username: string;
  /** Exchange password */
  password: string;
  /** Authentication method (0=Standard, 1=NTLM) */
  authenticationMethod?: number;
  /** Exchange server version */
  exchangeVersion?: number;
  /** Enable compression for requests */
  useCompression?: boolean;
}
