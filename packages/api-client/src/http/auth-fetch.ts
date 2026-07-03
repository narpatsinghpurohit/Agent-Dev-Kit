import { getApiClientConfig, type SessionUpdate } from '../auth/token-storage';

const REFRESH_PATH = '/api/auth/refresh';

let refreshInFlight: Promise<boolean> | null = null;

/**
 * Single-flight refresh: concurrent 401s share one refresh call — parallel
 * refreshes would trip the API's own token-reuse detection.
 */
export async function refreshSession(): Promise<boolean> {
  refreshInFlight ??= doRefresh().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

async function doRefresh(): Promise<boolean> {
  const { baseUrl = '', storage, onSession, onSessionExpired } = getApiClientConfig();
  try {
    const response = await fetch(`${baseUrl}${REFRESH_PATH}`, {
      method: 'POST',
      credentials: 'include', // the httpOnly refresh cookie
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    if (!response.ok) throw new Error(`refresh failed: ${response.status}`);
    const session = (await response.json()) as SessionUpdate;
    storage.setAccessToken(session.accessToken);
    onSession?.(session);
    return true;
  } catch {
    storage.setAccessToken(null);
    onSessionExpired?.();
    return false;
  }
}

/**
 * fetch with base URL, Bearer injection, and one retry through the
 * single-flight refresh on 401. Returns the raw Response — the copilot's
 * chat transport streams from it; customFetch parses it for REST hooks.
 */
export async function authFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const { baseUrl = '', storage } = getApiClientConfig();
  const url = path.startsWith('http') ? path : `${baseUrl}${path}`;

  const attempt = () => {
    const headers = new Headers(init.headers);
    const token = storage.getAccessToken();
    if (token) headers.set('authorization', `Bearer ${token}`);
    return fetch(url, { ...init, headers, credentials: 'include' });
  };

  const response = await attempt();
  if (response.status !== 401 || url.includes(REFRESH_PATH)) return response;

  const refreshed = await refreshSession();
  if (!refreshed) return response;
  // Retry once — attempt() re-reads the rotated token itself.
  return attempt();
}
