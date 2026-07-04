import { LANGUAGE_NAMES, LanguageCodeSchema, type LanguageCode, type Sex } from '@repo/schemas';
import { inputClass, primaryButtonClass } from '../../../components/form-styles';
import type { PatientFormViewModel } from './patient-form.hook';

const SEXES: Sex[] = ['female', 'male', 'other'];

export function PatientFormView({ form, serverError, isSaving, onCancel }: PatientFormViewModel) {
  return (
    <form
      className="mx-auto flex max-w-xl flex-col gap-4 rounded-xl border border-edge bg-panel p-6"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <h2 className="text-lg font-semibold">New patient</h2>

      <form.Field name="name">
        {(field) => (
          <label className="flex flex-col gap-1 text-sm">
            Name
            <input
              className={inputClass}
              value={field.state.value}
              onChange={(event) => field.handleChange(event.target.value)}
              maxLength={120}
              required
            />
          </label>
        )}
      </form.Field>

      <div className="grid grid-cols-2 gap-4">
        <form.Field name="age">
          {(field) => (
            <label className="flex flex-col gap-1 text-sm">
              Age
              <input
                type="number"
                min="0"
                max="120"
                className={inputClass}
                value={field.state.value}
                onChange={(event) => field.handleChange(event.target.value)}
                required
              />
            </label>
          )}
        </form.Field>
        <form.Field name="sex">
          {(field) => (
            <label className="flex flex-col gap-1 text-sm">
              Sex
              <select
                className={inputClass}
                value={field.state.value}
                onChange={(event) => field.handleChange(event.target.value as Sex)}
              >
                {SEXES.map((sex) => (
                  <option key={sex} value={sex}>
                    {sex}
                  </option>
                ))}
              </select>
            </label>
          )}
        </form.Field>
      </div>

      <form.Field name="language">
        {(field) => (
          <label className="flex flex-col gap-1 text-sm">
            Patient&apos;s language <span className="text-ink-dim">(the app speaks this)</span>
            <select
              className={inputClass}
              value={field.state.value}
              onChange={(event) => field.handleChange(event.target.value as LanguageCode)}
            >
              {LanguageCodeSchema.options.map((code) => (
                <option key={code} value={code}>
                  {LANGUAGE_NAMES[code]}
                </option>
              ))}
            </select>
          </label>
        )}
      </form.Field>

      <form.Field name="phone">
        {(field) => (
          <label className="flex flex-col gap-1 text-sm">
            Phone <span className="text-ink-dim">(optional)</span>
            <input
              className={inputClass}
              value={field.state.value}
              onChange={(event) => field.handleChange(event.target.value)}
              maxLength={20}
            />
          </label>
        )}
      </form.Field>

      <form.Field name="notes">
        {(field) => (
          <label className="flex flex-col gap-1 text-sm">
            Notes <span className="text-ink-dim">(optional)</span>
            <textarea
              className={`${inputClass} min-h-20`}
              value={field.state.value}
              onChange={(event) => field.handleChange(event.target.value)}
              maxLength={2000}
            />
          </label>
        )}
      </form.Field>

      {serverError ? (
        <p role="alert" className="text-sm text-danger">
          {serverError}
        </p>
      ) : null}

      <div className="flex gap-3">
        <button type="submit" disabled={isSaving} className={primaryButtonClass}>
          {isSaving ? 'Saving…' : 'Register patient'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-edge px-4 py-2 text-sm text-ink-dim hover:text-ink"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
