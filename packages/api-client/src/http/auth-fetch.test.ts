import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureApiClient, type TokenStorage } from '../auth/token-storage';
import { authFetch } from './auth-fetch';
import { customFetch } from './custom-fetch';

const BASE = 'http://api.test';
const server = setupServer();

function memoryStorage(initial: string | null = null): TokenStorage {
  let token = initial;
  return {
    getAccessToken: () => token,
    setAccessToken: (next) => {
      token = next;
    },
  };
}

const session = {
  accessToken: 'fresh-token',
  user: {
    id: '507f1f77bcf86cd799439011',
    email: 'a@example.com',
    name: 'Ada',
    emailVerified: true,
    createdAt: '2026-07-03T00:00:00.000Z',
  },
};

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('authFetch', () => {
  beforeEach(() => {
    configureApiClient({ baseUrl: BASE, storage: memoryStorage('stale-token') });
  });

  it('attaches the bearer token', async () => {
    let seen: string | null = null;
    server.use(
      http.get(`${BASE}/api/tasks`, ({ request }) => {
        seen = request.headers.get('authorization');
        return HttpResponse.json({ items: [], nextCursor: null });
      }),
    );
    await authFetch('/api/tasks');
    expect(seen).toBe('Bearer stale-token');
  });

  it('refreshes once on 401 and retries with the new token', async () => {
    let refreshCalls = 0;
    server.use(
      http.get(`${BASE}/api/tasks`, ({ request }) =>
        request.headers.get('authorization') === 'Bearer fresh-token'
          ? HttpResponse.json({ items: [], nextCursor: null })
          : new HttpResponse(null, { status: 401 }),
      ),
      http.post(`${BASE}/api/auth/refresh`, () => {
        refreshCalls += 1;
        return HttpResponse.json(session);
      }),
    );

    const response = await authFetch('/api/tasks');
    expect(response.status).toBe(200);
    expect(refreshCalls).toBe(1);
  });

  it('single-flights concurrent refreshes', async () => {
    let refreshCalls = 0;
    server.use(
      http.get(`${BASE}/api/tasks`, ({ request }) =>
        request.headers.get('authorization') === 'Bearer fresh-token'
          ? HttpResponse.json({ items: [], nextCursor: null })
          : new HttpResponse(null, { status: 401 }),
      ),
      http.post(`${BASE}/api/auth/refresh`, async () => {
        refreshCalls += 1;
        await new Promise((resolve) => setTimeout(resolve, 30));
        return HttpResponse.json(session);
      }),
    );

    const [a, b, c] = await Promise.all([
      authFetch('/api/tasks'),
      authFetch('/api/tasks'),
      authFetch('/api/tasks'),
    ]);
    expect([a.status, b.status, c.status]).toEqual([200, 200, 200]);
    expect(refreshCalls).toBe(1); // parallel refreshes would trip reuse detection
  });

  it('signals session expiry when refresh fails and does not retry-loop', async () => {
    const onSessionExpired = vi.fn();
    configureApiClient({ baseUrl: BASE, storage: memoryStorage('stale'), onSessionExpired });
    server.use(
      http.get(`${BASE}/api/tasks`, () => new HttpResponse(null, { status: 401 })),
      http.post(`${BASE}/api/auth/refresh`, () => new HttpResponse(null, { status: 401 })),
    );

    const response = await authFetch('/api/tasks');
    expect(response.status).toBe(401);
    expect(onSessionExpired).toHaveBeenCalledTimes(1);
  });
});

describe('customFetch', () => {
  beforeEach(() => {
    configureApiClient({ baseUrl: BASE, storage: memoryStorage('token') });
  });

  it('parses JSON bodies', async () => {
    server.use(http.get(`${BASE}/api/auth/me`, () => HttpResponse.json(session.user)));
    const user = await customFetch<typeof session.user>('/api/auth/me');
    expect(user.email).toBe('a@example.com');
  });

  it('returns undefined for 204', async () => {
    server.use(http.post(`${BASE}/api/auth/logout`, () => new HttpResponse(null, { status: 204 })));
    const result = await customFetch('/api/auth/logout', { method: 'POST' });
    expect(result).toBeUndefined();
  });

  it('returns blobs for audio responses', async () => {
    server.use(
      http.post(
        `${BASE}/api/ai/tts`,
        () =>
          new HttpResponse(new Uint8Array([82, 73, 70, 70]), {
            headers: { 'content-type': 'audio/wav' },
          }),
      ),
    );
    const blob = await customFetch<Blob>('/api/ai/tts', { method: 'POST' });
    expect(blob).toBeInstanceOf(Blob);
  });

  it('throws ApiError with the envelope message on failures', async () => {
    server.use(
      http.get(`${BASE}/api/tasks/nope`, () =>
        HttpResponse.json(
          { statusCode: 404, error: 'Not Found', message: 'Task not found' },
          { status: 404 },
        ),
      ),
    );
    await expect(customFetch('/api/tasks/nope')).rejects.toMatchObject({
      name: 'ApiError',
      status: 404,
      message: 'Task not found',
    });
  });
});
