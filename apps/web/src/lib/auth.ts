import {
  authGoogleLogin,
  authLogin,
  authLogout,
  authSignup,
  configureApiClient,
  refreshSession,
  type SessionUpdate,
  type SessionUser,
} from '@repo/api-client';
import type { GoogleLoginInput, LoginInput, SignupInput } from '@repo/schemas';

/**
 * Auth state for the SPA. The access token lives in a module-scope variable
 * (never localStorage — XSS cannot exfiltrate what it cannot reach); the
 * refresh token is an httpOnly cookie the JS never sees.
 */
export type AuthStatus = 'unknown' | 'authenticated' | 'unauthenticated';

export interface AuthState {
  status: AuthStatus;
  user: SessionUser | null;
}

let accessToken: string | null = null;
let state: AuthState = { status: 'unknown', user: null };
const listeners = new Set<() => void>();

function setState(next: AuthState): void {
  state = next;
  for (const listener of listeners) listener();
}

export const authStore = {
  getState: (): AuthState => state,
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

export type AuthStore = typeof authStore;

configureApiClient({
  baseUrl: import.meta.env.VITE_API_URL ?? '',
  storage: {
    getAccessToken: () => accessToken,
    setAccessToken: (token) => {
      accessToken = token;
    },
  },
  onSession: (session) => applySession(session),
  onSessionExpired: () => setState({ status: 'unauthenticated', user: null }),
});

function applySession(session: SessionUpdate): void {
  accessToken = session.accessToken;
  setState({ status: 'authenticated', user: session.user });
}

/**
 * One silent refresh BEFORE the router mounts, so the `_authenticated`
 * beforeLoad guard sees a settled status and never flickers.
 */
export async function bootstrapAuth(): Promise<void> {
  const refreshed = await refreshSession();
  if (!refreshed) setState({ status: 'unauthenticated', user: null });
}

export async function login(input: LoginInput): Promise<void> {
  const session = await authLogin(input);
  applySession(session as SessionUpdate);
}

export async function signup(input: SignupInput): Promise<void> {
  const session = await authSignup(input);
  applySession(session as SessionUpdate);
}

/** Exchange a Google ID-token credential for the app's own session. */
export async function loginWithGoogle(input: GoogleLoginInput): Promise<void> {
  const session = await authGoogleLogin(input);
  applySession(session as SessionUpdate);
}

export async function logout(): Promise<void> {
  await authLogout({}).catch(() => undefined);
  accessToken = null;
  setState({ status: 'unauthenticated', user: null });
}
