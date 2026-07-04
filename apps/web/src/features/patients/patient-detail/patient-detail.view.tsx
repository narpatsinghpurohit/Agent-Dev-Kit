import { Link } from '@tanstack/react-router';
import { LANGUAGE_NAMES, LanguageCodeSchema, type LanguageCode } from '@repo/schemas';
import { inputClass, primaryButtonClass } from '../../../components/form-styles';
import type { PatientDetailViewModel } from './patient-detail.hook';

export function PatientDetailView({
  patient,
  consultations,
  consultationsLoading,
  doctorLanguage,
  serverError,
  isStarting,
  onDoctorLanguageChange,
  onStartConsultation,
}: PatientDetailViewModel) {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <Link to="/patients" className="text-sm text-ink-dim hover:text-ink">
          ← Patients
        </Link>
        <div className="mt-2 rounded-xl border border-edge bg-panel p-6">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-semibold">{patient.name}</h1>
              <p className="text-sm text-ink-dim">
                {patient.age} y · {patient.sex}
                {patient.phone ? ` · ${patient.phone}` : ''}
              </p>
            </div>
            <span className="rounded-full bg-surface px-3 py-1 text-sm text-ink-dim">
              {LANGUAGE_NAMES[patient.language]}
            </span>
          </div>
          {patient.notes ? <p className="mt-3 text-sm text-ink-dim">{patient.notes}</p> : null}
        </div>
      </div>

      <div className="rounded-xl border border-edge bg-panel p-6">
        <h2 className="mb-3 text-lg font-semibold">Start a consultation</h2>
        <p className="mb-3 text-sm text-ink-dim">
          Questions go out in {LANGUAGE_NAMES[patient.language]}; answers come back in your
          language.
        </p>
        <div className="flex items-end gap-3">
          <label className="flex flex-1 flex-col gap-1 text-sm">
            Your language
            <select
              className={inputClass}
              value={doctorLanguage}
              onChange={(event) => onDoctorLanguageChange(event.target.value as LanguageCode)}
            >
              {LanguageCodeSchema.options.map((code) => (
                <option key={code} value={code}>
                  {LANGUAGE_NAMES[code]}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => void onStartConsultation()}
            disabled={isStarting}
            className={primaryButtonClass}
          >
            {isStarting ? 'Starting…' : 'Start consultation'}
          </button>
        </div>
        {serverError ? (
          <p role="alert" className="mt-2 text-sm text-danger">
            {serverError}
          </p>
        ) : null}
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold">Consultations</h2>
        {consultationsLoading ? <p className="text-ink-dim">Loading…</p> : null}
        {!consultationsLoading && consultations.length === 0 ? (
          <p className="rounded-lg border border-dashed border-edge p-6 text-center text-ink-dim">
            No consultations recorded yet.
          </p>
        ) : null}
        <ul className="flex flex-col gap-2">
          {consultations.map((consultation) => (
            <li key={consultation.id}>
              <Link
                to="/consultations/$consultationId"
                params={{ consultationId: consultation.id }}
                className="block rounded-lg border border-edge bg-panel px-4 py-3 hover:border-accent-soft"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">
                    {consultation.summary?.chiefComplaint ?? 'In progress — no summary yet'}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      consultation.status === 'completed'
                        ? 'bg-ok/15 text-ok'
                        : 'bg-accent/15 text-accent-soft'
                    }`}
                  >
                    {consultation.status === 'completed' ? 'Completed' : 'In progress'}
                  </span>
                </div>
                <span className="text-xs text-ink-dim">
                  {new Date(consultation.createdAt).toLocaleString()} · {consultation.turns.length}{' '}
                  turns
                </span>
                {consultation.summary?.redFlags.length ? (
                  <p className="mt-1 text-xs text-danger">
                    ⚑ {consultation.summary.redFlags.join(' · ')}
                  </p>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
