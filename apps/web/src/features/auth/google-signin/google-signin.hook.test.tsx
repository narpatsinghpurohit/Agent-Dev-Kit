/**
 * The GIS script cannot load under happy-dom, so these tests cover the
 * enabled/disabled decision from the public auth config — the branch that
 * keeps the kit keyless (no client ID → no button container at all).
 */
import { waitFor } from '@testing-library/react';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { configureApiClient } from '@repo/api-client';
import { getAuthConfigMockHandler } from '@repo/api-client/mocks';
import { renderHookWithProviders } from '../../../shared/testing/test-utils';
import { useGoogleSignin } from './google-signin.hook';

const server = setupServer();

beforeAll(() => {
  configureApiClient({
    baseUrl: '',
    storage: { getAccessToken: () => null, setAccessToken: () => undefined },
  });
  server.listen({ onUnhandledRequest: 'error' });
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('useGoogleSignin', () => {
  it('stays disabled when no client ID is configured (keyless mode)', async () => {
    server.use(getAuthConfigMockHandler({ googleClientId: null }));
    const { result } = await renderHookWithProviders(() => useGoogleSignin());
    await waitFor(() => expect(result.current).not.toBeNull());
    expect(result.current.enabled).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('enables once the public config supplies a client ID', async () => {
    server.use(
      getAuthConfigMockHandler({ googleClientId: '1234567890-abc.apps.googleusercontent.com' }),
    );
    const { result } = await renderHookWithProviders(() => useGoogleSignin());
    await waitFor(() => expect(result.current.enabled).toBe(true));
  });
});
