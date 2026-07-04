// Runtime (hand-written)
export {
  configureApiClient,
  type ApiClientConfig,
  type SessionUpdate,
  type SessionUser,
  type TokenStorage,
} from './auth/token-storage';
export { authFetch, refreshSession } from './http/auth-fetch';
export { ApiError, customFetch } from './http/custom-fetch';

// Generated (committed, drift-checked — regenerate with `pnpm gen:client`)
export * from './generated/models';
export * from './generated/auth/auth';
export * from './generated/patients/patients';
export * from './generated/consultations/consultations';
export * from './generated/vitals/vitals';
export * from './generated/queue/queue';
export * from './generated/alerts/alerts';
export * from './generated/ai/ai';
export * from './generated/settings/settings';
