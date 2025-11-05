export interface ICurrentUserService {
  getCurrentUserSub(): string | null;
  getCurrentTeamId(): string | null;
  getScopes(): string[];
  isAuthenticated(): boolean;
}
