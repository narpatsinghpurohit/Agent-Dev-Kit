import { inputClass, primaryButtonClass } from '../../auth/components/auth-card';
import type { TaskFormViewModel } from './task-form.hook';

export function TaskFormView({ form, serverError, isEdit, onCancel }: TaskFormViewModel) {
  return (
    <form
      className="flex flex-col gap-4 rounded-xl border border-edge bg-panel p-6"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <h2 className="text-lg font-semibold">{isEdit ? 'Edit task' : 'New task'}</h2>

      <form.Field name="title">
        {(field) => (
          <label className="flex flex-col gap-1 text-sm">
            Title
            <input
              className={inputClass}
              value={field.state.value}
              onChange={(event) => field.handleChange(event.target.value)}
              onBlur={field.handleBlur}
              maxLength={200}
              required
            />
          </label>
        )}
      </form.Field>

      <form.Field name="description">
        {(field) => (
          <label className="flex flex-col gap-1 text-sm">
            Description <span className="text-ink-dim">(optional)</span>
            <textarea
              className={`${inputClass} min-h-24`}
              value={field.state.value}
              onChange={(event) => field.handleChange(event.target.value)}
              onBlur={field.handleBlur}
              maxLength={2000}
            />
          </label>
        )}
      </form.Field>

      <form.Field name="dueDate">
        {(field) => (
          <label className="flex flex-col gap-1 text-sm">
            Due date <span className="text-ink-dim">(optional, must be in the future)</span>
            <input
              type="date"
              className={inputClass}
              value={field.state.value}
              onChange={(event) => field.handleChange(event.target.value)}
              onBlur={field.handleBlur}
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
        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <button type="submit" disabled={isSubmitting} className={primaryButtonClass}>
              {isSubmitting ? 'Saving…' : isEdit ? 'Save changes' : 'Create task'}
            </button>
          )}
        </form.Subscribe>
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
