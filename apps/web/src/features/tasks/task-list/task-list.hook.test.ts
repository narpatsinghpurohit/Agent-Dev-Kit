/**
 * Hook tests: renderHook + the orval-generated MSW handlers with explicit
 * fixtures (never hand-written fetch mocks, never random faker data).
 */
import { waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { configureApiClient, getTasksListUrl } from '@repo/api-client';
import { getTasksListMockHandler } from '@repo/api-client/mocks';
import { renderHookWithProviders } from '../../../shared/testing/test-utils';
import { useTaskList } from './task-list.hook';

const page1 = {
  items: [
    {
      id: '507f1f77bcf86cd799439011',
      title: 'First task',
      status: 'todo' as const,
      createdAt: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-07-01T00:00:00.000Z',
    },
    {
      id: '507f1f77bcf86cd799439012',
      title: 'Second task',
      status: 'done' as const,
      createdAt: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-07-01T00:00:00.000Z',
    },
  ],
  nextCursor: null,
};

const server = setupServer(getTasksListMockHandler(page1));

beforeAll(() => {
  configureApiClient({
    baseUrl: '',
    storage: { getAccessToken: () => 'test-token', setAccessToken: () => undefined },
  });
  server.listen({ onUnhandledRequest: 'error' });
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('useTaskList', () => {
  it('flattens pages into a task list', async () => {
    const { result } = await renderHookWithProviders(() => useTaskList(undefined));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.tasks.map((t) => t.title)).toEqual(['First task', 'Second task']);
    expect(result.current.hasNextPage).toBe(false);
  });

  it('sends the status filter to the API', async () => {
    let seenStatus: string | null = null;
    server.use(
      http.get(`*${getTasksListUrl({}).split('?')[0]}`, ({ request }) => {
        seenStatus = new URL(request.url).searchParams.get('status');
        return HttpResponse.json({ items: [], nextCursor: null });
      }),
    );

    const { result } = await renderHookWithProviders(() => useTaskList('done'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(seenStatus).toBe('done');
    expect(result.current.tasks).toEqual([]);
  });
});
