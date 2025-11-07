export type CurrentUserContext = {
  userSub: string | null;
  userId: number | null;
  teamId: number | null;
  scopes: string[];
  impersonatorId?: string | null;
  // Optional correlation fields
  traceId?: string;
  runId?: string;
  tz?: string; // e.g., "Europe/Berlin"
};
