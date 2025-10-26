
export interface ICurrentUserService {
    getCurrentUserId(): string | null;
    getCurrentTeamId(): string | null;
    getScopes(): string[];
    isAuthenticated(): boolean;
}
