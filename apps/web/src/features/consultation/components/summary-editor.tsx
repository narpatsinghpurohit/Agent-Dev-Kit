import { useState } from 'react';
import type { ConsultationSummary, Symptom } from '@repo/schemas';
import { inputClass, primaryButtonClass } from '../../../components/form-styles';

/**
 * Pure editor for the AI-drafted record — plain local state, saved as a
 * whole via the parent's onSave. List fields use simple text encodings a
 * busy compounder can type fast:
 *   symptoms — one per line: "name | duration | severity | notes"
 *   medications/allergies — comma-separated; red flags — one per line.
 */
export function SummaryEditor({
  summary,
  isSaving,
  onSave,
}: {
  summary: ConsultationSummary;
  isSaving: boolean;
  onSave: (summary: ConsultationSummary) => Promise<boolean>;
}) {
  const [chiefComplaint, setChiefComplaint] = useState(summary.chiefComplaint);
  const [symptomsText, setSymptomsText] = useState(summary.symptoms.map(symptomLine).join('\n'));
  const [history, setHistory] = useState(summary.history);
  const [medications, setMedications] = useState(summary.medications.join(', '));
  const [allergies, setAllergies] = useState(summary.allergies.join(', '));
  const [redFlags, setRedFlags] = useState(summary.redFlags.join('\n'));
  const [additionalNotes, setAdditionalNotes] = useState(summary.additionalNotes);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const submit = async () => {
    setSavedAt(null);
    const ok = await onSave({
      chiefComplaint: chiefComplaint.trim(),
      symptoms: symptomsText.split('\n').map(parseSymptom).filter(isSymptom),
      history: history.trim(),
      medications: splitList(medications, ','),
      allergies: splitList(allergies, ','),
      redFlags: splitList(redFlags, '\n'),
      additionalNotes: additionalNotes.trim(),
    });
    if (ok) setSavedAt(Date.now());
  };

  return (
    <form
      className="flex flex-col gap-4 rounded-xl border border-edge bg-panel p-6"
      data-testid="summary-editor"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <h2 className="text-lg font-semibold">Consultation record</h2>

      <Labeled label="Chief complaint">
        <input
          className={inputClass}
          value={chiefComplaint}
          onChange={(event) => setChiefComplaint(event.target.value)}
          maxLength={500}
          required
        />
      </Labeled>

      <Labeled label="Symptoms" hint="one per line: name | duration | mild/moderate/severe | notes">
        <textarea
          className={`${inputClass} min-h-20 font-mono text-sm`}
          value={symptomsText}
          onChange={(event) => setSymptomsText(event.target.value)}
        />
      </Labeled>

      <Labeled label="Red flags" hint="one per line — shown prominently on the patient record">
        <textarea
          className={`${inputClass} min-h-16`}
          value={redFlags}
          onChange={(event) => setRedFlags(event.target.value)}
        />
      </Labeled>

      <div className="grid grid-cols-2 gap-4">
        <Labeled label="Medications" hint="comma-separated">
          <input
            className={inputClass}
            value={medications}
            onChange={(event) => setMedications(event.target.value)}
          />
        </Labeled>
        <Labeled label="Allergies" hint="comma-separated">
          <input
            className={inputClass}
            value={allergies}
            onChange={(event) => setAllergies(event.target.value)}
          />
        </Labeled>
      </div>

      <Labeled label="History">
        <textarea
          className={`${inputClass} min-h-16`}
          value={history}
          onChange={(event) => setHistory(event.target.value)}
          maxLength={2000}
        />
      </Labeled>

      <Labeled label="Additional notes">
        <textarea
          className={`${inputClass} min-h-16`}
          value={additionalNotes}
          onChange={(event) => setAdditionalNotes(event.target.value)}
          maxLength={2000}
        />
      </Labeled>

      <div className="flex items-center gap-3">
        <button type="submit" disabled={isSaving} className={primaryButtonClass}>
          {isSaving ? 'Saving…' : 'Save record'}
        </button>
        {savedAt ? (
          <span role="status" className="text-sm text-ok">
            Saved.
          </span>
        ) : null}
      </div>
    </form>
  );
}

function Labeled({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span>
        {label}
        {hint ? <span className="ml-2 text-xs text-ink-dim">{hint}</span> : null}
      </span>
      {children}
    </label>
  );
}

function symptomLine(symptom: Symptom): string {
  return [symptom.name, symptom.duration ?? '', symptom.severity ?? '', symptom.notes ?? '']
    .join(' | ')
    .replace(/(\s\|\s)+$/, '');
}

function parseSymptom(line: string): Symptom | null {
  const [name, duration, severity, notes] = line.split('|').map((part) => part.trim());
  if (!name) return null;
  return {
    name,
    ...(duration ? { duration } : {}),
    ...(severity === 'mild' || severity === 'moderate' || severity === 'severe'
      ? { severity }
      : {}),
    ...(notes ? { notes } : {}),
  };
}

function isSymptom(value: Symptom | null): value is Symptom {
  return value !== null;
}

function splitList(value: string, separator: string): string[] {
  return value
    .split(separator)
    .map((item) => item.trim())
    .filter(Boolean);
}
