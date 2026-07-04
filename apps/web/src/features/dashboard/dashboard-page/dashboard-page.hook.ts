import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useSyncExternalStore } from 'react';
import {
  getAlertsListQueryKey,
  useAlertsDismiss,
  useAlertsList,
  usePatientsList,
  useQueueList,
} from '@repo/api-client';
import type { OutbreakAlert, Patient, QueueEntry } from '@repo/schemas';
import { authStore } from '../../../lib/auth';

/** Keep in sync with the `/dashboard` route loader's `{ limit: 5 }` prefetch. */
const RECENT_PATIENTS_LIMIT = 5;

/**
 * ViewModel for the dashboard: today's queue (with waiting/active/done
 * counts), dismissible outbreak alerts, and a recent-activity card. The
 * consultations list endpoint requires a patientId, so a cross-patient
 * "recent consultations" feed is not expressible — the latest registered
 * patients stand in as recent activity instead.
 */
export function useDashboardPage() {
  const auth = useSyncExternalStore(authStore.subscribe, authStore.getState);
  const queryClient = useQueryClient();

  const queueQuery = useQueueList();
  const alertsQuery = useAlertsList();
  const patientsQuery = usePatientsList({ limit: RECENT_PATIENTS_LIMIT });

  const queue: QueueEntry[] = [...(queueQuery.data?.items ?? [])].sort((a, b) =>
    a.scheduledAt.localeCompare(b.scheduledAt),
  );
  const counts = {
    waiting: queue.filter((entry) => entry.status === 'waiting').length,
    active: queue.filter((entry) => entry.status === 'active').length,
    done: queue.filter((entry) => entry.status === 'done').length,
  };
  const alerts: OutbreakAlert[] = alertsQuery.data?.items ?? [];
  const recentPatients: Patient[] = patientsQuery.data?.items ?? [];

  const {
    mutate: dismiss,
    isPending: isDismissPending,
    variables: dismissVariables,
  } = useAlertsDismiss({
    mutation: {
      // Return the promise so the mutation stays pending until the refetch lands.
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getAlertsListQueryKey() }),
    },
  });

  return {
    userName: auth.user?.name ?? '',
    counts,
    queue,
    alerts,
    recentPatients,
    isLoading: queueQuery.isLoading || alertsQuery.isLoading || patientsQuery.isLoading,
    isError: queueQuery.isError || alertsQuery.isError || patientsQuery.isError,
    dismissingAlertId: isDismissPending ? (dismissVariables?.id ?? null) : null,
    onDismissAlert: useCallback((id: string) => dismiss({ id }), [dismiss]),
  };
}

export type DashboardPageViewModel = ReturnType<typeof useDashboardPage>;
