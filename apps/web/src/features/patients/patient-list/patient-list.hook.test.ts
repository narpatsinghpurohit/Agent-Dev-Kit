/**
 * Hook test with the orval-generated MSW handlers and explicit fixtures —
 * never hand-written fetch mocks (repo testing standard).
 */
import { waitFor } from '@testing-library/react';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { configureApiClient } from '@repo/api-client';
import { getPatientsListMockHandler } from '@repo/api-client/mocks';
import { renderHookWithProviders } from '../../../shared/testing/test-utils';
import { usePatientList } from './patient-list.hook';

const page = {
  items: [
    {
      id: 'a1b2c3d4e5f6a1b2c3d4e5f6',
      name: 'Asha Devi',
      age: 54,
      sex: 'female' as const,
      language: 'hi-IN' as const,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ],
  nextCursor: null,
};

const server = setupServer(getPatientsListMockHandler(page));

beforeAll(() => {
  configureApiClient({
    baseUrl: '',
    storage: { getAccessToken: () => 'test-token', setAccessToken: () => undefined },
  });
  server.listen({ onUnhandledRequest: 'error' });
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('usePatientList', () => {
  it('flattens pages into the patient list and reports pagination state', async () => {
    const { result } = await renderHookWithProviders(() => usePatientList());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.patients).toHaveLength(1);
    expect(result.current.patients[0]).toMatchObject({ name: 'Asha Devi', language: 'hi-IN' });
    expect(result.current.hasNextPage).toBe(false);
    expect(result.current.isError).toBe(false);
  });
});
