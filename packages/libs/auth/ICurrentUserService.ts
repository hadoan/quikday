export interface ICurrentUserService {
  getCurrentUserSub(): string | null;
  getCurrentTeamId(): number | null;
  getScopes(): string[];
  isAuthenticated(): boolean;
}
