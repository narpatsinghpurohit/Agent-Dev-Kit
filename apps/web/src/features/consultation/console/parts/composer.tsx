import { ChevronDown, ChevronUp, Mic } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../../../../components/ui/button';
import { Input } from '../../../../components/ui/input';
import { cn } from '../../../../lib/utils';
import { shortLanguageName } from '../format';
import type { ConsoleViewModel } from '../console.hook';

/** 8 bars, staggered per the design so the waveform never looks metronomic. */
const WAVEFORM_BARS = [
  { duration: '0.9s', delay: '0s' },
  { duration: '1.1s', delay: '0.15s' },
  { duration: '0.8s', delay: '0.3s' },
  { duration: '1.2s', delay: '0.05s' },
  { duration: '0.95s', delay: '0.25s' },
  { duration: '1.05s', delay: '0.4s' },
  { duration: '0.85s', delay: '0.1s' },
  { duration: '1.15s', delay: '0.35s' },
];

/**
 * The console composer: quick-ask chips, the patient push-to-talk mic with
 * its pulse + waveform, the doctor question input with the direction label
 * and the pillow "Ask via Vedita" button, plus the collapsible typed
 * patient-answer fallback (forced open when no microphone is available).
 */
export function Composer({
  consultation,
  quickAsks,
  question,
  patientText,
  isRecording,
  isAsking,
  isAnswering,
  micAvailable,
  onQuickAsk,
  onQuestionChange,
  onPatientTextChange,
  onAsk,
  onAnswerText,
  onToggleRecording,
}: Pick<
  ConsoleViewModel,
  | 'consultation'
  | 'quickAsks'
  | 'question'
  | 'patientText'
  | 'isRecording'
  | 'isAsking'
  | 'isAnswering'
  | 'micAvailable'
  | 'onQuickAsk'
  | 'onQuestionChange'
  | 'onPatientTextChange'
  | 'onAsk'
  | 'onAnswerText'
  | 'onToggleRecording'
>) {
  const [typedAnswerOpen, setTypedAnswerOpen] = useState(false);
  const showTypedAnswer = typedAnswerOpen || !micAvailable;

  return (
    <div className="flex-none px-5 pb-4 pt-2">
      <div className="flex flex-col gap-2.5 rounded-xl border border-edge bg-panel p-3.5 shadow-md">
        {quickAsks.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {quickAsks.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => onQuickAsk(suggestion)}
                className="rounded-full border border-edge bg-panel px-[11px] py-[5px] text-xs text-secondary-foreground transition-colors hover:border-accent hover:bg-accent-soft hover:text-accent"
              >
                {suggestion}
              </button>
            ))}
          </div>
        ) : null}

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => void onToggleRecording()}
            disabled={!micAvailable || isAnswering}
            aria-pressed={isRecording}
            aria-label={isRecording ? 'Stop recording and translate' : 'Record patient answer'}
            className={cn(
              'flex size-11 flex-none items-center justify-center rounded-full transition-colors disabled:opacity-50',
              isRecording
                ? 'animate-vedita-pulse bg-accent text-white'
                : 'bg-secondary text-ink-dim hover:bg-edge/70 hover:text-ink',
            )}
          >
            <Mic aria-hidden className="size-[19px]" />
          </button>

          <div aria-hidden className="flex h-7 w-16 flex-none items-center gap-[3px]">
            {WAVEFORM_BARS.map((bar) => (
              <span
                key={`${bar.duration}-${bar.delay}`}
                className="h-full w-1 origin-center rounded-[2px] bg-accent"
                style={{
                  animation: `vedita-bar ${bar.duration} ease-in-out ${bar.delay} infinite`,
                  animationPlayState: isRecording ? 'running' : 'paused',
                  opacity: isRecording ? 1 : 0.3,
                }}
              />
            ))}
          </div>

          <form
            className="flex min-w-0 flex-1 items-center gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              void onAsk();
            }}
          >
            <input
              className="min-w-0 flex-1 border-none bg-transparent text-sm text-ink outline-none placeholder:text-ink-dim"
              placeholder="Tell Vedita what to ask, or dictate notes — any language"
              aria-label="Doctor question"
              value={question}
              onChange={(event) => onQuestionChange(event.target.value)}
              maxLength={1000}
            />
            <span className="flex-none font-mono text-[11px] text-ink-dim">
              Doctor {shortLanguageName(consultation.doctorLanguage)} → Patient{' '}
              {shortLanguageName(consultation.patientLanguage)}
            </span>
            <Button type="submit" disabled={isAsking || !question.trim()}>
              {isAsking ? 'Translating…' : 'Ask via Vedita'}
            </Button>
          </form>
        </div>

        <div className="flex flex-col gap-2">
          {micAvailable ? (
            <button
              type="button"
              onClick={() => setTypedAnswerOpen((open) => !open)}
              aria-expanded={showTypedAnswer}
              className="inline-flex w-fit items-center gap-1 text-xs text-ink-dim hover:text-ink"
            >
              {showTypedAnswer ? (
                <ChevronUp aria-hidden className="size-3.5" />
              ) : (
                <ChevronDown aria-hidden className="size-3.5" />
              )}
              Type the patient&rsquo;s answer instead
            </button>
          ) : null}
          {showTypedAnswer ? (
            <form
              className="flex gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                void onAnswerText();
              }}
            >
              <Input
                placeholder="…or type the patient's answer"
                aria-label="Patient answer"
                value={patientText}
                onChange={(event) => onPatientTextChange(event.target.value)}
                maxLength={2000}
              />
              <Button type="submit" variant="outline" disabled={isAnswering || !patientText.trim()}>
                Add
              </Button>
            </form>
          ) : null}
          {isAnswering ? <span className="text-xs text-ink-dim">Translating…</span> : null}
        </div>
      </div>
    </div>
  );
}
