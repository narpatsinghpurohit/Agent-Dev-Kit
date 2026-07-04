import { Check } from 'lucide-react';
import { cn } from '../../../../lib/utils';
import { fieldKeyLabel, initialsOf, shortLanguageName } from '../format';
import type { ConsoleViewModel } from '../console.hook';

type Turn = ConsoleViewModel['consultation']['turns'][number];

/**
 * The live conversation feed. Bubble anatomy per the design: header row
 * (18px avatar + bold speaker + dim meta), bubble with the original text and
 * the translation under a dashed divider, then optional green captured-to-EHR
 * chips. Doctor bubbles sit right in violet tint; patient bubbles left in
 * white; private Vedita insights sit right in amber.
 */
export function Transcript({
  turns,
  patientName,
  doctorName,
  patientLanguageName,
}: {
  turns: Turn[];
  patientName: string;
  doctorName: string;
  patientLanguageName: string;
}) {
  return (
    <div
      className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-auto px-5 pb-3 pt-1.5"
      data-testid="transcript"
    >
      <div className="self-center rounded-full border border-edge bg-panel px-3 py-1 text-[11.5px] text-ink-dim">
        Consultation started · Vedita detected patient speaks {patientLanguageName} · translating
        live
      </div>
      {turns.length === 0 ? (
        <p className="m-auto text-sm text-ink-dim">
          Ask your first question below — the patient hears it in {patientLanguageName}.
        </p>
      ) : null}
      {turns.map((turn) => (
        <TurnBubble key={turn.id} turn={turn} patientName={patientName} doctorName={doctorName} />
      ))}
    </div>
  );
}

function TurnBubble({
  turn,
  patientName,
  doctorName,
}: {
  turn: Turn;
  patientName: string;
  doctorName: string;
}) {
  const isInsight = turn.kind === 'insight';
  const isDoctor = turn.speaker === 'doctor';
  const alignEnd = isDoctor || isInsight;

  const who = isInsight ? 'Vedita' : isDoctor ? doctorName : patientName;
  const meta = isInsight
    ? 'insight for doctor · private'
    : isDoctor
      ? // Short native form ("हिन्दी") per the design — the verbose combined
        // name would clutter every bubble header.
        `to patient · ${shortLanguageName(turn.targetLanguage)} · spoken aloud`
      : `patient · ${shortLanguageName(turn.sourceLanguage)} · auto-translated`;
  const showTranslation = !isInsight && turn.translatedText !== turn.sourceText;

  return (
    <div className={cn('flex flex-col gap-1', alignEnd ? 'items-end' : 'items-start')}>
      <div className="flex items-center gap-1.5 text-[11px] text-ink-dim">
        <span
          className={cn(
            'inline-flex size-[18px] items-center justify-center rounded-full text-[9px] font-bold',
            isInsight && 'bg-ink text-insight',
            isDoctor && 'bg-accent text-white',
            !isInsight && !isDoctor && 'bg-avatar text-avatar-fg',
          )}
        >
          {isInsight ? 'V' : initialsOf(who)}
        </span>
        <span className="font-semibold text-ink">{who}</span>
        <span>{meta}</span>
      </div>
      <div
        className={cn(
          'flex max-w-[520px] flex-col gap-1.5 rounded-lg border px-3.5 py-2.5',
          isInsight && 'border-insight-border bg-insight text-insight-fg',
          isDoctor && 'border-accent/25 bg-accent-soft',
          !isInsight && !isDoctor && 'border-edge bg-panel',
        )}
      >
        <div className="text-sm leading-relaxed">{turn.sourceText}</div>
        {showTranslation ? (
          <div className="border-t border-dashed border-edge pt-1.5 text-[12.5px] leading-relaxed text-ink-dim">
            {turn.translatedText}
          </div>
        ) : null}
      </div>
      {turn.capturedFields.length > 0 ? (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-ok-soft px-2.5 py-[3px] text-[11px] text-ok">
          <Check aria-hidden className="size-[11px]" strokeWidth={2.5} />
          Captured to EHR — {turn.capturedFields.map(fieldKeyLabel).join(' · ')}
        </span>
      ) : null}
    </div>
  );
}
