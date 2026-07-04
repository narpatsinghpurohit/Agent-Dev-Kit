import { createFileRoute } from '@tanstack/react-router';
import { getPatientsListInfiniteQueryOptions } from '@repo/api-client';
import { PatientListPage } from '../../../features/patients';

/**
 * Routes stay pure config: a loader that prefetches through the SAME
 * generated queryOptions the feature hook uses — the INFINITE variant,
 * because the hook is usePatientsListInfinite (one cache entry under
 * ['infinite', <url>], no double fetch).
 */
export const Route = createFileRoute('/_authenticated/patients/')({
  loader: ({ context }) =>
    context.queryClient.ensureInfiniteQueryData(
      getPatientsListInfiniteQueryOptions(
        { limit: 20 },
        {
          query: {
            initialPageParam: undefined,
            getNextPageParam: (lastPage: { nextCursor: string | null }) =>
              lastPage.nextCursor ?? undefined,
          },
        },
      ),
    ),
  component: PatientListPage,
});
