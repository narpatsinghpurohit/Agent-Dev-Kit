import { PRAKRITI_LABELS } from '@repo/schemas';
import { Badge } from '../../../../components/ui/badge';
import { cn } from '../../../../lib/utils';
import { initialsOf } from '../format';
import type { ConsoleViewModel } from '../console.hook';

const sectionLabelClass = 'text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-dim';

function trendToneClass(direction: 'up' | 'down' | 'flat', metric: string): string {
  if (direction === 'flat') return 'text-ink-dim';
  // Rising BP/pulse is bad (red); falling weight is the success story (green).
  if (direction === 'up') return metric === 'weight' ? 'text-warn' : 'text-danger';
  return 'text-ok';
}

const trendArrow = { up: '↑', down: '↓', flat: '→' } as const;

/** Left column: identity, prakriti/conditions, vitals + trends, regimen, queue. */
export function PatientPanel({
  patient,
  clinical,
  latestVital,
  vitalTrends,
  queue,
}: Pick<ConsoleViewModel, 'patient' | 'clinical' | 'latestVital' | 'vitalTrends' | 'queue'>) {
  const bpTrend = vitalTrends.find((trend) => trend.metric === 'bp');
  const weightTrend = vitalTrends.find((trend) => trend.metric === 'weight');
  const waitingCount = queue.filter((entry) => entry.status === 'waiting').length;

  return (
    <aside className="flex w-[272px] flex-none flex-col border-r border-edge bg-panel">
      <div className="flex flex-col gap-3 p-4 pb-0">
        <div className="flex items-center gap-3">
          <span className="flex size-11 flex-none items-center justify-center rounded-full bg-warn/10 text-[15px] font-semibold text-warn">
            {initialsOf(patient?.name ?? '')}
          </span>
          <div className="min-w-0">
            <div className="text-[15px] font-semibold">{patient?.name ?? 'Patient'}</div>
            {patient ? (
              <div className="text-xs text-ink-dim">
                {patient.age} · {patient.sex.charAt(0).toUpperCase() + patient.sex.slice(1)} · AHMIS
                #{patient.id.slice(-5).toUpperCase()}
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {clinical?.prakriti ? (
            <Badge variant="purple">Prakriti: {PRAKRITI_LABELS[clinical.prakriti]}</Badge>
          ) : null}
          {(clinical?.conditions ?? []).map((condition) => (
            <Badge
              key={condition}
              variant={
                condition.toLowerCase() === 'hypertension' ? 'destructive-soft' : 'secondary'
              }
            >
              {condition}
            </Badge>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-md border border-edge p-2.5">
            <div className="text-[11px] text-ink-dim">BP today</div>
            <div
              className={cn(
                'text-base font-semibold',
                bpTrend?.direction === 'up' && 'text-danger',
              )}
            >
              {latestVital?.systolic != null && latestVital.diastolic != null
                ? `${latestVital.systolic}/${latestVital.diastolic}`
                : '—'}
            </div>
            {bpTrend ? (
              <div className={cn('text-[11px]', trendToneClass(bpTrend.direction, 'bp'))}>
                {trendArrow[bpTrend.direction]} {bpTrend.label}
              </div>
            ) : null}
          </div>
          <div className="rounded-md border border-edge p-2.5">
            <div className="text-[11px] text-ink-dim">Weight</div>
            <div className="text-base font-semibold">
              {latestVital?.weightKg != null ? `${latestVital.weightKg} kg` : '—'}
            </div>
            {weightTrend ? (
              <div className={cn('text-[11px]', trendToneClass(weightTrend.direction, 'weight'))}>
                {trendArrow[weightTrend.direction]} {weightTrend.label}
              </div>
            ) : null}
          </div>
        </div>

        {clinical && clinical.regimen.length > 0 ? (
          <div className="flex flex-col gap-1.5 rounded-md border border-edge px-3 py-2.5">
            <div className={sectionLabelClass}>Current regimen</div>
            <div className="text-[12.5px] leading-relaxed">
              {clinical.regimen.map((item) => (
                <div key={item.name}>
                  {[item.name, [item.dose, item.schedule].filter(Boolean).join(' ')]
                    .filter(Boolean)
                    .join(' · ')}
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <div className="mt-4 flex min-h-0 flex-1 flex-col gap-2 overflow-auto border-t border-edge p-4">
        <div className="flex items-center justify-between">
          <div className={sectionLabelClass}>Today&rsquo;s queue</div>
          <span className="text-[11px] text-ink-dim">{waitingCount} waiting</span>
        </div>
        {queue.length === 0 ? (
          <p className="text-xs text-ink-dim">No visits scheduled today.</p>
        ) : null}
        {queue.map((entry) => {
          const active = entry.status === 'active';
          return (
            <div
              key={entry.id}
              className={cn(
                'flex items-center gap-2.5 rounded-md border px-2.5 py-2',
                active ? 'border-accent/25 bg-accent-soft' : 'border-edge bg-panel',
              )}
            >
              <span
                aria-hidden
                className={cn('size-2 flex-none rounded-full', active ? 'bg-accent' : 'bg-pending')}
              />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-medium">{entry.patientName}</div>
                <div className="truncate text-[11px] text-ink-dim">{entry.reason}</div>
              </div>
              <span className="font-mono text-[11px] text-ink-dim">
                {active
                  ? 'now'
                  : new Date(entry.scheduledAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: false,
                    })}
              </span>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
