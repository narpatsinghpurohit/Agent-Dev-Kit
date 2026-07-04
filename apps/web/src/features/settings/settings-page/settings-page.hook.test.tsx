/**
 * Hook test with the orval-generated MSW handlers and explicit fixtures —
 * the suspense query needs a Suspense boundary around the hook harness.
 */
import { Suspense, type ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  configureApiClient,
  getSettingsGetUrl,
  type AiModelsResponseDtoOutput,
} from '@repo/api-client';
import { getChatModelsMockHandler, getSettingsGetMockHandler } from '@repo/api-client/mocks';
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
    featureModels: { summarize: 'google:gemini-2.5-flash' },
  },
  general: {
    corsOrigins: ['http://localhost:5173'],
    requireEmailVerification: false,
    googleClientId: null,
  },
  secrets: {
    googleApiKey: { set: true, hint: '…1234' },
    bedrockApiKey: { set: false, hint: null },
    sarvamApiKey: { set: false, hint: null },
  },
};

const modelsFixture: AiModelsResponseDtoOutput = {
  features: [
    { feature: 'copilot-chat', model: 'mock:copilot-chat' },
    { feature: 'summarize', model: 'google:gemini-2.5-flash' },
    { feature: 'treatment-plan', model: 'mock:treatment-plan' },
  ],
};

const server = setupServer(
  getSettingsGetMockHandler(fixture),
  getChatModelsMockHandler(modelsFixture),
);

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

  it('exposes feature-model rows with effective refs and the stored override', async () => {
    const { result } = await renderSettingsHook();
    await waitFor(() => expect(result.current).not.toBeNull());
    const summarize = result.current.featureModels.find((row) => row.feature === 'summarize');
    expect(summarize).toMatchObject({
      label: 'Summarize',
      effectiveModel: 'google:gemini-2.5-flash',
      override: 'google:gemini-2.5-flash',
    });
    const quickAsks = result.current.featureModels.find((row) => row.feature === 'quick-asks');
    expect(quickAsks).toMatchObject({ label: 'Quick asks', effectiveModel: null, override: '' });
  });

  it('saves only the touched feature-model overrides', async () => {
    let body: unknown = null;
    server.use(
      http.put(`*${getSettingsGetUrl()}`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(fixture);
      }),
    );

    const { result } = await renderSettingsHook();
    await waitFor(() => expect(result.current).not.toBeNull());
    act(() => {
      result.current.featureModels
        .find((row) => row.feature === 'treatment-plan')
        ?.onChange('bedrock:us.anthropic.claude-sonnet-5');
    });
    await act(async () => {
      await result.current.form.handleSubmit();
    });
    await waitFor(() => expect(body).not.toBeNull());
    // summarize is unchanged from the stored override, so it is omitted.
    expect((body as { ai: { featureModels: unknown } }).ai.featureModels).toEqual({
      'treatment-plan': 'bedrock:us.anthropic.claude-sonnet-5',
    });
  });

  it('sends null for a cleared override on save', async () => {
    let body: unknown = null;
    server.use(
      http.put(`*${getSettingsGetUrl()}`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(fixture);
      }),
    );

    const { result } = await renderSettingsHook();
    await waitFor(() => expect(result.current).not.toBeNull());
    act(() => {
      result.current.featureModels.find((row) => row.feature === 'summarize')?.onClear();
    });
    await act(async () => {
      await result.current.form.handleSubmit();
    });
    await waitFor(() => expect(body).not.toBeNull());
    expect((body as { ai: { featureModels: unknown } }).ai.featureModels).toEqual({
      summarize: null,
    });
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
