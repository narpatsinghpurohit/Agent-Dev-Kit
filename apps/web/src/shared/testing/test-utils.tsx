import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { render, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';

/**
 * Test harness: a fresh QueryClient per test (no cache bleed, no retries)
 * and a memory router so components using <Link> and hooks using
 * useNavigate/useSearch don't throw outside the real app.
 */
export function createTestWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false },
    },
  });

  // The root route renders whatever the current test mounted.
  const contentRef: { current: ReactNode } = { current: null };
  const rootRoute = createRootRoute({ component: () => <>{contentRef.current}</> });
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory(),
    context: undefined as never,
  });

  function Wrapper({ children }: { children: ReactNode }) {
    contentRef.current = children;
    return (
      <QueryClientProvider client={queryClient}>
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any -- the app's Register interface types the real router; tests use a minimal one */}
        <RouterProvider router={router as any} />
      </QueryClientProvider>
    );
  }

  return { queryClient, router, Wrapper };
}

/** Router matching is async — load before render so the first paint is real. */
export async function renderWithProviders(ui: ReactNode) {
  const { Wrapper, queryClient, router } = createTestWrapper();
  await router.load();
  return { ...render(<Wrapper>{ui}</Wrapper>), queryClient };
}

export async function renderHookWithProviders<T>(hook: () => T) {
  const { Wrapper, queryClient, router } = createTestWrapper();
  await router.load();
  return { ...renderHook(hook, { wrapper: Wrapper }), queryClient };
}
