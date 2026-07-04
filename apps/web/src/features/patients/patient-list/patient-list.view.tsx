import { Link } from '@tanstack/react-router';
import { LANGUAGE_NAMES } from '@repo/schemas';
import { inputClass } from '../../../components/form-styles';
import type { PatientListViewModel } from './patient-list.hook';

/** Pure props → JSX. No data imports — that is lint-enforced, not a convention. */
export function PatientListView({
  patients,
  search,
  isLoading,
  isError,
  hasNextPage,
  isFetchingNextPage,
  onSearchChange,
  onLoadMore,
}: PatientListViewModel) {
  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Patients</h1>
        <Link
          to="/patients/new"
          className="rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-white shadow-[0_3px_0_0_var(--color-accent-deep)] hover:bg-accent-hover active:translate-y-[3px] active:shadow-none"
        >
          New patient
        </Link>
      </div>

      <input
        type="search"
        placeholder="Search by name…"
        aria-label="Search patients"
        className={`${inputClass} mb-4`}
        value={search}
        onChange={(event) => onSearchChange(event.target.value)}
      />

      {isLoading ? <p className="text-ink-dim">Loading…</p> : null}
      {isError ? (
        <p role="alert" className="text-danger">
          Could not load patients.
        </p>
      ) : null}
      {!isLoading && patients.length === 0 ? (
        <p className="rounded-lg border border-dashed border-edge p-8 text-center text-ink-dim">
          No patients yet — register one, or ask the copilot to do it for you.
        </p>
      ) : null}

      <ul className="flex flex-col gap-2">
        {patients.map((patient) => (
          <li
            key={patient.id}
            className="rounded-lg border border-edge bg-panel px-4 py-3 hover:border-accent/40"
          >
            <Link to="/patients/$patientId" params={{ patientId: patient.id }} className="block">
              <div className="flex items-center justify-between">
                <span className="font-medium">{patient.name}</span>
                <span className="rounded-full bg-surface px-2 py-0.5 text-xs text-ink-dim">
                  {LANGUAGE_NAMES[patient.language]}
                </span>
              </div>
              <span className="text-xs text-ink-dim">
                {patient.age} y · {patient.sex}
                {patient.phone ? ` · ${patient.phone}` : ''}
              </span>
            </Link>
          </li>
        ))}
      </ul>

      {hasNextPage ? (
        <button
          type="button"
          onClick={onLoadMore}
          disabled={isFetchingNextPage}
          className="mt-4 w-full rounded-md border border-edge py-2 text-sm text-ink-dim hover:text-ink"
        >
          {isFetchingNextPage ? 'Loading…' : 'Load more'}
        </button>
      ) : null}
    </div>
  );
}
