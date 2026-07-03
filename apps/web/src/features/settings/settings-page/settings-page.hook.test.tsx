/**
 * Hook test with the orval-generated MSW handlers and explicit fixtures —
 * the suspense query needs a Suspense boundary around the hook harness.
 */
import { Suspense, type ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { configureApiClient, getSettingsGetUrl } from '@repo/api-client';
import { getSettingsGetMockHandler } from '@repo/api-client/mocks';
import { createTestWrapper } from '../../../shared/testing/test-utils';
import { useSettingsPage } from './settings-page.hook';

const fixture = {
  ai: {
    providerMode: 'mock' as const,
    awsRegion: 'us-east-1',
    dailyTokenBudget: 200_000,
    copilot: {
      model: 'mock:copilot-chat',
      temperature: 0.7,
      maxOutputTokens: 4096,
      topP: null,
    },
  },
  general: { corsOrigins: ['http://localhost:5173'], requireEmailVerification: false },
  secrets: {
    googleApiKey: { set: true, hint: '…1234' },
    bedrockApiKey: { set: false, hint: null },
  },
};

const server = setupServer(getSettingsGetMockHandler(fixture));

beforeAll(() => {
  configureApiClient({
    baseUrl: '',
    storage: { getAccessToken: () => 'test-token', setAccessToken: () => undefined },
  });
  server.listen({ onUnhandledRequest: 'error' });
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

async function renderSettingsHook() {
  const { Wrapper: Base, router } = createTestWrapper();
  await router.load();
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <Base>
        <Suspense fallback={null}>{children}</Suspense>
      </Base>
    );
  }
  return renderHook(() => useSettingsPage(), { wrapper: Wrapper });
}

describe('useSettingsPage', () => {
  it('loads current settings into the form defaults (numbers as strings)', async () => {
    const { result } = await renderSettingsHook();
    await waitFor(() => expect(result.current).not.toBeNull());
    expect(result.current.form.state.values).toMatchObject({
      model: 'mock:copilot-chat',
      temperature: '0.7',
      maxOutputTokens: '4096',
      topP: '',
      corsOrigins: 'http://localhost:5173',
      googleApiKey: '', // secrets are never pre-filled
    });
    expect(result.current.secrets.googleApiKey).toEqual({ set: true, hint: '…1234' });
  });

  it('sends a null patch when a secret is removed', async () => {
    let body: unknown = null;
    server.use(
      http.put(`*${getSettingsGetUrl()}`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(fixture);
      }),
    );

    const { result } = await renderSettingsHook();
    await waitFor(() => expect(result.current).not.toBeNull());
    result.current.onClearSecret('googleApiKey');
    await waitFor(() => expect(body).toEqual({ secrets: { googleApiKey: null } }));
  });
});
