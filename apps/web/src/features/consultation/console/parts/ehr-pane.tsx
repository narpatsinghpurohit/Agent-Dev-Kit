import { CheckCircle2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../../../../components/ui/button';
import { cn } from '../../../../lib/utils';
import { SummaryEditor } from '../../components/summary-editor';
import type { ConsoleViewModel, EhrField } from '../console.hook';

function confidenceTone(confidence: number): string {
  if (confidence >= 0.85) return 'text-ok';
  if (confidence >= 0.7) return 'text-warn';
  return 'text-ink-dim';
}

/**
 * Right column, "EHR draft" tab: the auto-fill status line, one card per
 * captured field (mono confidence, violet "just added" highlight, italic
 * source line), the AHMIS sign button, and the embedded record editor.
 */
export function EhrPane({
  consultation,
  ehrFields,
  capturedCount,
  isSigning,
  isSavingSummary,
  onSignAhmis,
  onSaveSummary,
}: Pick<
  ConsoleViewModel,
  | 'consultation'
  | 'ehrFields'
  | 'capturedCount'
  | 'isSigning'
  | 'isSavingSummary'
  | 'onSignAhmis'
  | 'onSaveSummary'
>) {
  const [editing, setEditing] = useState(false);
  const inProgress = consultation.status === 'in_progress';
  const signed = consultation.ahmisStatus === 'synced';
  const canSign = consultation.status === 'completed' && consultation.summary !== null;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-auto p-4">
      <div className="flex items-center gap-2">
        {inProgress ? (
          <span className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-accent">
            <span aria-hidden className="size-1.5 animate-vedita-blink rounded-full bg-accent" />
            Auto-filling from conversation
          </span>
        ) : (
          <span className="text-[11.5px] font-medium text-ink-dim">Draft ready for review</span>
        )}
        <div className="flex-1" />
        <span className="text-[11px] text-ink-dim">{capturedCount} fields captured</span>
      </div>

      {ehrFields.length === 0 ? (
        <p className="py-6 text-center text-sm text-ink-dim">
          Vedita drafts the record as the conversation unfolds — finish the consultation to generate
          the structured summary.
        </p>
      ) : null}

      {ehrFields.map((field) => (
        <FieldCard key={field.key} field={field} />
      ))}

      <div className="flex gap-2 pt-1">
        {signed ? (
          <Button disabled className="flex-1 bg-ok text-white shadow-none disabled:opacity-100">
            <CheckCircle2 aria-hidden />
            Signed to AHMIS
          </Button>
        ) : (
          <Button
            className="flex-1"
            disabled={!canSign || isSigning}
            onClick={() => void onSignAhmis()}
          >
            {isSigning ? 'Signing…' : 'Review & sign to AHMIS'}
          </Button>
        )}
        {consultation.summary ? (
          <Button
            variant="outline"
            onClick={() => setEditing((open) => !open)}
            aria-pressed={editing}
          >
            {editing ? 'Close' : 'Edit'}
          </Button>
        ) : null}
      </div>

      {editing && consultation.summary ? (
        <SummaryEditor
          // Remount only when the draft first appears (finish) — not on every
          // save, which would wipe the editor's local state mid-edit.
          key={`${consultation.id}:${consultation.status}`}
          summary={consultation.summary}
          isSaving={isSavingSummary}
          onSave={onSaveSummary}
        />
      ) : null}
    </div>
  );
}

function FieldCard({ field }: { field: EhrField }) {
  return (
    <div
      className={cn(
        'flex flex-col gap-[5px] rounded-md border px-3 py-2.5',
        field.isNew ? 'border-accent/40 bg-accent-soft' : 'border-edge bg-panel',
      )}
    >
      <div className="flex items-center gap-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-dim">
          {field.label}
        </span>
        <div className="flex-1" />
        {field.confidence === null ? (
          <span className="font-mono text-[10.5px] text-ink-dim">manual</span>
        ) : (
          <span className={cn('font-mono text-[10.5px]', confidenceTone(field.confidence))}>
            {field.confidence.toFixed(2)}
          </span>
        )}
        {field.isNew ? (
          <span className="rounded-full bg-panel px-[7px] py-[2px] text-[10px] font-semibold text-accent">
            just added
          </span>
        ) : null}
      </div>
      <div className="text-[13.5px] leading-relaxed">{field.value}</div>
      {field.source ? <div className="text-[11px] italic text-ink-dim">{field.source}</div> : null}
    </div>
  );
}
