export type CurrentUserContext = {
  userId: string | null;
  teamId: string | null;
  scopes: string[];
  impersonatorId?: string | null;
  // Optional correlation fields
  traceId?: string;
  runId?: string;
  tz?: string; // e.g., "Europe/Berlin"
};
