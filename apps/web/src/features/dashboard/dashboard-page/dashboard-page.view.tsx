import { Link } from '@tanstack/react-router';
import { CalendarClock, Info, TriangleAlert, UserPlus } from 'lucide-react';
import { LANGUAGE_NAMES } from '@repo/schemas';
import type { AlertSeverity, OutbreakAlert, QueueEntry, QueueStatus } from '@repo/schemas';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import { cn } from '../../../lib/utils';
import type { DashboardPageViewModel } from './dashboard-page.hook';

const STATUS_DOT_CLASS: Record<QueueStatus, string> = {
  active: 'bg-accent',
  waiting: 'bg-pending',
  done: 'bg-ok',
};

const SEVERITY_ROW_CLASS: Record<AlertSeverity, string> = {
  warning: 'border-danger/25 bg-danger-soft text-danger',
  watch: 'border-insight-border bg-insight text-insight-fg',
  info: 'border-edge bg-surface text-ink',
};

function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/** One queue entry: status dot, name + reason, mono time; clicks open the patient. */
export function QueueRow({ entry }: { entry: QueueEntry }) {
  return (
    <li>
      <Link
        to="/patients/$patientId"
        params={{ patientId: entry.patientId }}
        className={cn(
          'flex items-center gap-2.5 rounded-md border px-3 py-2',
          entry.status === 'active'
            ? 'border-accent/30 bg-accent-soft'
            : 'border-edge bg-panel hover:border-accent/40',
        )}
      >
        <span
          data-testid="queue-status-dot"
          aria-hidden
          className={cn('size-2 shrink-0 rounded-full', STATUS_DOT_CLASS[entry.status])}
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium">{entry.patientName}</span>
          <span className="block truncate text-[11px] text-ink-dim">{entry.reason}</span>
        </span>
        <span className="font-mono text-[11px] text-ink-dim">{timeLabel(entry.scheduledAt)}</span>
      </Link>
    </li>
  );
}

/** One outbreak advisory: severity-toned row with a dismiss action. */
export function AlertRow({
  alert,
  isDismissing,
  onDismiss,
}: {
  alert: OutbreakAlert;
  isDismissing: boolean;
  onDismiss: (id: string) => void;
}) {
  const Icon = alert.severity === 'info' ? Info : TriangleAlert;
  const meta = [
    alert.caseCount != null ? `${alert.caseCount} cases` : null,
    alert.radiusKm != null ? `within ${alert.radiusKm} km` : null,
    alert.windowLabel || null,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <li
      data-testid="alert-row"
      className={cn(
        'flex items-start gap-2.5 rounded-md border px-3 py-2.5',
        SEVERITY_ROW_CLASS[alert.severity],
      )}
    >
      <Icon aria-hidden className="mt-0.5 size-4 shrink-0" />
      <span className="min-w-0 flex-1 text-[12.5px] leading-relaxed">
        <span className="font-semibold">{alert.title}</span> · {alert.detail}
        {meta ? <span className="mt-0.5 block text-[11px] opacity-75">{meta}</span> : null}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-label={`Dismiss ${alert.title}`}
        disabled={isDismissing}
        onClick={() => onDismiss(alert.id)}
        className="h-auto px-1.5 py-0.5 text-[12px] font-semibold text-current hover:bg-transparent hover:text-current"
      >
        Dismiss
      </Button>
    </li>
  );
}

function StatCard({ label, value, dotClass }: { label: string; value: number; dotClass: string }) {
  return (
    <Card className="gap-0 py-4">
      <CardContent className="flex flex-col gap-1">
        <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-ink-dim">
          <span aria-hidden className={cn('size-2 rounded-full', dotClass)} />
          {label}
        </span>
        <span className="text-2xl font-semibold">{value}</span>
      </CardContent>
    </Card>
  );
}

/** Pure props → JSX. No data imports — that is lint-enforced, not a convention. */
export function DashboardPageView({
  userName,
  counts,
  queue,
  alerts,
  recentPatients,
  isLoading,
  isError,
  dismissingAlertId,
  onDismissAlert,
}: DashboardPageViewModel) {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold">Welcome back{userName ? `, ${userName}` : ''}</h1>
        <p className="mt-1 text-sm text-ink-dim">Your clinic at a glance for today.</p>
      </header>

      {isError ? (
        <p role="alert" className="text-danger">
          Could not load the dashboard.
        </p>
      ) : null}

      {isLoading ? (
        <p className="text-ink-dim">Loading…</p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard label="Waiting" value={counts.waiting} dotClass="bg-pending" />
            <StatCard label="In consultation" value={counts.active} dotClass="bg-accent" />
            <StatCard label="Completed" value={counts.done} dotClass="bg-ok" />
          </div>

          <div className="grid items-start gap-6 lg:grid-cols-5">
            <Card className="lg:col-span-3">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CalendarClock aria-hidden className="size-4 text-ink-dim" />
                  Today&apos;s queue
                </CardTitle>
              </CardHeader>
              <CardContent>
                {queue.length === 0 ? (
                  <p className="rounded-md border border-dashed border-edge p-6 text-center text-sm text-ink-dim">
                    No appointments scheduled for today.
                  </p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {queue.map((entry) => (
                      <QueueRow key={entry.id} entry={entry} />
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <div className="flex flex-col gap-6 lg:col-span-2">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TriangleAlert aria-hidden className="size-4 text-ink-dim" />
                    Outbreak alerts
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {alerts.length === 0 ? (
                    <p className="rounded-md border border-dashed border-edge p-6 text-center text-sm text-ink-dim">
                      No active advisories.
                    </p>
                  ) : (
                    <ul className="flex flex-col gap-2">
                      {alerts.map((alert) => (
                        <AlertRow
                          key={alert.id}
                          alert={alert}
                          isDismissing={dismissingAlertId === alert.id}
                          onDismiss={onDismissAlert}
                        />
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <UserPlus aria-hidden className="size-4 text-ink-dim" />
                    Recent patients
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {recentPatients.length === 0 ? (
                    <p className="rounded-md border border-dashed border-edge p-6 text-center text-sm text-ink-dim">
                      No patients registered yet.
                    </p>
                  ) : (
                    <ul className="flex flex-col gap-2">
                      {recentPatients.map((patient) => (
                        <li key={patient.id}>
                          <Link
                            to="/patients/$patientId"
                            params={{ patientId: patient.id }}
                            className="flex items-center justify-between gap-3 rounded-md border border-edge bg-panel px-3 py-2 hover:border-accent/40"
                          >
                            <span className="min-w-0">
                              <span className="block truncate text-[13px] font-medium">
                                {patient.name}
                              </span>
                              <span className="block text-[11px] text-ink-dim">
                                {patient.age} y · {patient.sex}
                              </span>
                            </span>
                            <Badge variant="secondary">{LANGUAGE_NAMES[patient.language]}</Badge>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
