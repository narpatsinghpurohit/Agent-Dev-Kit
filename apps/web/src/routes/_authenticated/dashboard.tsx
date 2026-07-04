import { createFileRoute } from '@tanstack/react-router';
import {
  getAlertsListQueryOptions,
  getPatientsListQueryOptions,
  getQueueListQueryOptions,
} from '@repo/api-client';
import { DashboardPage } from '../../features/dashboard';

/**
 * Pure config: the loader prefetches through the SAME generated queryOptions
 * the dashboard hook uses (queue, alerts, and the 5 recent patients), so the
 * loader and the hook share one cache entry each — no double fetch.
 */
export const Route = createFileRoute('/_authenticated/dashboard')({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(getQueueListQueryOptions()),
      context.queryClient.ensureQueryData(getAlertsListQueryOptions()),
      context.queryClient.ensureQueryData(getPatientsListQueryOptions({ limit: 5 })),
    ]),
  component: DashboardPage,
});
