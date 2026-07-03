/**
 * Platform-injected access-token holder. The web app provides a module-scope
 * in-memory implementation (never localStorage); a future mobile app injects
 * its own. The refresh token never passes through here — browsers keep it in
 * an httpOnly cookie, handled entirely by the API.
 */
export interface TokenStorage {
  getAccessToken(): string | null;
  setAccessToken(token: string | null): void;
}

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
  createdAt: string;
}

export interface SessionUpdate {
  accessToken: string;
  user: SessionUser;
}

export interface ApiClientConfig {
  /** Empty in dev — the Vite proxy makes the API same-origin. */
  baseUrl?: string;
  storage: TokenStorage;
  /** Called after a successful silent refresh (keep app state in sync). */
  onSession?: (session: SessionUpdate) => void;
  /** Called when refresh fails — the session is gone; route to login. */
  onSessionExpired?: () => void;
}

let config: ApiClientConfig | null = null;

export function configureApiClient(next: ApiClientConfig): void {
  config = next;
}

export function getApiClientConfig(): ApiClientConfig {
  if (!config) {
    throw new Error('configureApiClient(...) must be called before using the API client');
  }
  return config;
}
