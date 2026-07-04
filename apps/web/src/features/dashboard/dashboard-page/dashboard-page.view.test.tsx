/**
 * Pure view test: props in, DOM out — vi.fn() callbacks, no MSW, no hook
 * mocking. Rendered via renderWithProviders only because <Link> reads
 * router context.
 */
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { OutbreakAlert, QueueEntry } from '@repo/schemas';
import { renderWithProviders } from '../../../shared/testing/test-utils';
import { AlertRow, QueueRow } from './dashboard-page.view';

const activeEntry: QueueEntry = {
  id: 'a00000000000000000000001',
  patientId: 'facefacefacefacefaceface',
  patientName: 'Kamla Devi',
  reason: 'Hypertension follow-up',
  scheduledAt: '2026-07-04T05:00:00Z',
  status: 'active',
  createdAt: '2026-07-04T04:00:00Z',
  updatedAt: '2026-07-04T04:00:00Z',
};

const warningAlert: OutbreakAlert = {
  id: 'b00000000000000000000001',
  title: 'Early-warning',
  detail: '14 fever-with-rash cases logged within 5 km this week.',
  caseCount: 14,
  radiusKm: 5,
  windowLabel: 'this week',
  severity: 'warning',
  createdAt: '2026-07-04T04:00:00Z',
};

describe('QueueRow', () => {
  it('renders name, reason, and an accent status dot linking to the patient', async () => {
    await renderWithProviders(
      <ul>
        <QueueRow entry={activeEntry} />
        <QueueRow
          entry={{
            ...activeEntry,
            id: 'a2',
            status: 'waiting',
            patientName: 'Abdul Rashid',
            reason: 'Joint pain, new',
          }}
        />
        <QueueRow
          entry={{
            ...activeEntry,
            id: 'a3',
            status: 'done',
            patientName: 'Suresh Yadav',
            reason: 'Kidney stone review',
          }}
        />
      </ul>,
    );

    const link = screen.getByRole('link', { name: /Kamla Devi/ });
    expect(link).toHaveAttribute('href', '/patients/facefacefacefacefaceface');
    expect(screen.getByText('Hypertension follow-up')).toBeInTheDocument();

    const dots = screen.getAllByTestId('queue-status-dot');
    expect(dots[0]).toHaveClass('bg-accent');
    expect(dots[1]).toHaveClass('bg-pending');
    expect(dots[2]).toHaveClass('bg-ok');
  });
});

describe('AlertRow', () => {
  it('tones the row by severity and reports a dismiss click with the alert id', async () => {
    const onDismiss = vi.fn();
    await renderWithProviders(
      <ul>
        <AlertRow alert={warningAlert} isDismissing={false} onDismiss={onDismiss} />
      </ul>,
    );

    expect(screen.getByTestId('alert-row')).toHaveClass('bg-danger-soft');
    expect(screen.getByText('Early-warning')).toBeInTheDocument();
    expect(screen.getByText(/14 cases · within 5 km · this week/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Dismiss Early-warning' }));
    expect(onDismiss).toHaveBeenCalledExactlyOnceWith(warningAlert.id);
  });

  it('disables the dismiss button while the dismissal is in flight', async () => {
    await renderWithProviders(
      <ul>
        <AlertRow alert={warningAlert} isDismissing onDismiss={vi.fn()} />
      </ul>,
    );
    expect(screen.getByRole('button', { name: 'Dismiss Early-warning' })).toBeDisabled();
  });
});
