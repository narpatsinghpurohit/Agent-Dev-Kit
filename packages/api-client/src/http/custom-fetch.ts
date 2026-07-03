import { authFetch } from './auth-fetch';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * orval mutator: every generated hook funnels through here — auth, refresh
 * retry, error envelope handling, and body parsing in one place.
 */
export async function customFetch<T>(url: string, init: RequestInit = {}): Promise<T> {
  const response = await authFetch(url, init);

  if (!response.ok) {
    const body = await safeJson(response);
    const message =
      (body as { message?: string } | undefined)?.message ?? `Request failed (${response.status})`;
    throw new ApiError(response.status, body, message);
  }

  if (response.status === 204) return undefined as T;

  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    return (await response.json()) as T;
  }
  if (contentType.startsWith('audio/') || contentType.includes('octet-stream')) {
    return (await response.blob()) as T;
  }
  return (await response.text()) as T;
}

async function safeJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}
