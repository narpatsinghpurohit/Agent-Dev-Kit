import { Link } from '@tanstack/react-router';
import { LANGUAGE_NAMES } from '@repo/schemas';
import { inputClass, primaryButtonClass } from '../../../components/form-styles';
import { SummaryEditor } from '../components/summary-editor';
import type { InterviewViewModel } from './interview.hook';

/** Pure props → JSX. No data imports — that is lint-enforced, not a convention. */
export function InterviewView({
  consultation,
  patient,
  question,
  patientText,
  error,
  isRecording,
  isAsking,
  isAnswering,
  isFinishing,
  isSavingSummary,
  micAvailable,
  onQuestionChange,
  onPatientTextChange,
  onAsk,
  onAnswerText,
  onToggleRecording,
  onFinish,
  onSaveSummary,
}: InterviewViewModel) {
  const inProgress = consultation.status === 'in_progress';

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <Link
            to="/patients/$patientId"
            params={{ patientId: consultation.patientId }}
            className="text-sm text-ink-dim hover:text-ink"
          >
            ← {patient?.name ?? 'Patient'}
          </Link>
          <h1 className="text-xl font-semibold">
            Consultation
            <span className="ml-3 align-middle text-sm font-normal text-ink-dim">
              you: {LANGUAGE_NAMES[consultation.doctorLanguage]} · patient:{' '}
              {LANGUAGE_NAMES[consultation.patientLanguage]}
            </span>
          </h1>
        </div>
        {inProgress ? (
          <button
            type="button"
            onClick={() => void onFinish()}
            disabled={isFinishing || consultation.turns.length === 0}
            className={primaryButtonClass}
          >
            {isFinishing ? 'Summarizing…' : 'Finish & summarize'}
          </button>
        ) : (
          <span className="rounded-full bg-ok/15 px-3 py-1 text-sm text-ok">Completed</span>
        )}
      </div>

      <div
        className="flex min-h-40 flex-col gap-3 rounded-xl border border-edge bg-panel p-4"
        data-testid="transcript"
      >
        {consultation.turns.length === 0 ? (
          <p className="m-auto text-sm text-ink-dim">
            Ask your first question below — the patient hears it in{' '}
            {LANGUAGE_NAMES[consultation.patientLanguage]}.
          </p>
        ) : null}
        {consultation.turns.map((turn) => (
          <div
            key={turn.id}
            className={`max-w-[85%] rounded-lg px-3 py-2 ${
              turn.speaker === 'doctor' ? 'self-end bg-accent/15' : 'self-start bg-surface'
            }`}
          >
            <p className="text-xs font-medium text-ink-dim">
              {turn.speaker === 'doctor' ? 'You' : (patient?.name ?? 'Patient')}
            </p>
            <p>{turn.sourceText}</p>
            <p className="mt-1 border-t border-edge pt-1 text-sm text-ink-dim">
              {turn.translatedText}
            </p>
          </div>
        ))}
      </div>

      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}

      {inProgress ? (
        <>
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void onAsk();
            }}
          >
            <input
              className={inputClass}
              placeholder={`Ask in ${LANGUAGE_NAMES[consultation.doctorLanguage]}…`}
              aria-label="Doctor question"
              value={question}
              onChange={(event) => onQuestionChange(event.target.value)}
              maxLength={1000}
            />
            <button
              type="submit"
              disabled={isAsking || !question.trim()}
              className={primaryButtonClass}
            >
              {isAsking ? 'Translating…' : 'Ask 🔊'}
            </button>
          </form>

          <div className="rounded-xl border border-dashed border-edge p-4">
            <p className="mb-2 text-sm font-medium">
              Patient answers in {LANGUAGE_NAMES[consultation.patientLanguage]}
            </p>
            <div className="flex items-center gap-3">
              {micAvailable ? (
                <button
                  type="button"
                  onClick={() => void onToggleRecording()}
                  disabled={isAnswering}
                  aria-pressed={isRecording}
                  className={`rounded-full px-4 py-2 text-sm font-medium ${
                    isRecording
                      ? 'animate-pulse bg-danger text-white'
                      : 'bg-accent text-white hover:bg-accent-hover'
                  }`}
                >
                  {isRecording ? '■ Stop & translate' : '🎤 Hold the phone to the patient'}
                </button>
              ) : null}
              {isAnswering ? <span className="text-sm text-ink-dim">Translating…</span> : null}
            </div>
            <form
              className="mt-3 flex gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                void onAnswerText();
              }}
            >
              <input
                className={inputClass}
                placeholder="…or type the patient's answer"
                aria-label="Patient answer"
                value={patientText}
                onChange={(event) => onPatientTextChange(event.target.value)}
                maxLength={2000}
              />
              <button
                type="submit"
                disabled={isAnswering || !patientText.trim()}
                className="rounded-md border border-edge px-4 py-2 text-sm text-ink-dim hover:text-ink"
              >
                Add
              </button>
            </form>
          </div>
        </>
      ) : null}

      {consultation.summary ? (
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
