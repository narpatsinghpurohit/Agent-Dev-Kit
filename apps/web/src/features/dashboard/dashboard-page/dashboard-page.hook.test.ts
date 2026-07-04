/**
 * Hook test with the orval-generated MSW handlers and explicit fixtures —
 * never hand-written fetch mocks (repo testing standard).
 */
import { waitFor } from '@testing-library/react';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { configureApiClient } from '@repo/api-client';
import {
  getAlertsDismissMockHandler,
  getAlertsListMockHandler,
  getPatientsListMockHandler,
  getQueueListMockHandler,
} from '@repo/api-client/mocks';
import { renderHookWithProviders } from '../../../shared/testing/test-utils';
import { useDashboardPage } from './dashboard-page.hook';

const NOW = new Date().toISOString();

function queueEntry(
  id: string,
  status: 'waiting' | 'active' | 'done',
  scheduledAt: string,
  patientName: string,
  reason: string,
) {
  return {
    id,
    patientId: 'facefacefacefacefaceface',
    patientName,
    reason,
    scheduledAt,
    status,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

const queuePage = {
  items: [
    queueEntry(
      'a00000000000000000000001',
      'done',
      '2026-07-04T04:00:00Z',
      'Suresh Yadav',
      'Kidney stone review',
    ),
    queueEntry(
      'a00000000000000000000002',
      'active',
      '2026-07-04T05:00:00Z',
      'Kamla Devi',
      'Hypertension follow-up',
    ),
    queueEntry(
      'a00000000000000000000003',
      'waiting',
      '2026-07-04T06:00:00Z',
      'Meena Kumari',
      'Obesity consult',
    ),
    queueEntry(
      'a00000000000000000000004',
      'waiting',
      '2026-07-04T07:00:00Z',
      'Abdul Rashid',
      'Joint pain, new',
    ),
  ],
};

const feverAlert = {
  id: 'b00000000000000000000001',
  title: 'Early-warning',
  detail: '14 fever-with-rash cases logged within 5 km this week.',
  caseCount: 14,
  radiusKm: 5,
  windowLabel: 'this week',
  severity: 'warning' as const,
  createdAt: NOW,
};

const infoAlert = {
  id: 'b00000000000000000000002',
  title: 'Advisory',
  detail: 'Seasonal pollen levels are elevated in the district.',
  caseCount: null,
  radiusKm: null,
  windowLabel: 'last 14 days',
  severity: 'info' as const,
  createdAt: NOW,
};

const patientsPage = {
  items: [
    {
      id: 'c00000000000000000000001',
      name: 'Asha Devi',
      age: 54,
      sex: 'female' as const,
      language: 'hi-IN' as const,
      createdAt: NOW,
      updatedAt: NOW,
    },
  ],
  nextCursor: null,
};

const server = setupServer(
  getQueueListMockHandler(queuePage),
  getAlertsListMockHandler({ items: [feverAlert, infoAlert] }),
  getPatientsListMockHandler(patientsPage),
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

describe('useDashboardPage', () => {
  it('derives waiting/active/done counts and sorts the queue by time', async () => {
    const { result } = await renderHookWithProviders(() => useDashboardPage());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.counts).toEqual({ waiting: 2, active: 1, done: 1 });
    expect(result.current.queue.map((entry) => entry.patientName)).toEqual([
      'Suresh Yadav',
      'Kamla Devi',
      'Meena Kumari',
      'Abdul Rashid',
    ]);
    expect(result.current.alerts).toHaveLength(2);
    expect(result.current.recentPatients[0]).toMatchObject({ name: 'Asha Devi' });
    expect(result.current.isError).toBe(false);
  });

  it('dismisses an alert via the endpoint and invalidates the alerts list', async () => {
    const dismissedIds: string[] = [];
    server.use(
      getAlertsDismissMockHandler(({ params }) => {
        dismissedIds.push(String(params.id));
      }),
    );

    const { result } = await renderHookWithProviders(() => useDashboardPage());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.alerts).toHaveLength(2);

    // After the dismissal the server only returns the remaining alert;
    // the hook must refetch (invalidate) to pick that up.
    server.use(getAlertsListMockHandler({ items: [infoAlert] }));
    result.current.onDismissAlert(feverAlert.id);

    await waitFor(() => expect(dismissedIds).toEqual([feverAlert.id]));
    await waitFor(() => expect(result.current.alerts).toHaveLength(1));
    expect(result.current.alerts[0]).toMatchObject({ id: infoAlert.id });
    expect(result.current.dismissingAlertId).toBeNull();
  });
});
