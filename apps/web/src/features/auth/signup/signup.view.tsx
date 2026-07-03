import { Link } from '@tanstack/react-router';
import { inputClass, primaryButtonClass } from '../../../components/form-styles';
import { AuthCard, FieldErrors } from '../components/auth-card';
import type { SignupViewModel } from './signup.hook';

export function SignupView({ form, serverError }: SignupViewModel) {
  return (
    <AuthCard title="Create your account" subtitle="Production-grade from the first commit">
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
      >
        <form.Field name="name">
          {(field) => (
            <label className="flex flex-col gap-1 text-sm">
              Name
              <input
                autoComplete="name"
                className={inputClass}
                value={field.state.value}
                onChange={(event) => field.handleChange(event.target.value)}
                onBlur={field.handleBlur}
              />
              <FieldErrors errors={field.state.meta.errors} />
            </label>
          )}
        </form.Field>

        <form.Field name="email">
          {(field) => (
            <label className="flex flex-col gap-1 text-sm">
              Email
              <input
                type="email"
                autoComplete="email"
                className={inputClass}
                value={field.state.value}
                onChange={(event) => field.handleChange(event.target.value)}
                onBlur={field.handleBlur}
              />
              <FieldErrors errors={field.state.meta.errors} />
            </label>
          )}
        </form.Field>

        <form.Field name="password">
          {(field) => (
            <label className="flex flex-col gap-1 text-sm">
              Password
              <input
                type="password"
                autoComplete="new-password"
                className={inputClass}
                value={field.state.value}
                onChange={(event) => field.handleChange(event.target.value)}
                onBlur={field.handleBlur}
              />
              <FieldErrors errors={field.state.meta.errors} />
            </label>
          )}
        </form.Field>

        {serverError ? (
          <p role="alert" className="text-sm text-danger">
            {serverError}
          </p>
        ) : null}

        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <button type="submit" disabled={isSubmitting} className={primaryButtonClass}>
              {isSubmitting ? 'Creating…' : 'Create account'}
            </button>
          )}
        </form.Subscribe>
      </form>
      <p className="mt-4 text-sm text-ink-dim">
        Already registered?{' '}
        <Link to="/login" className="text-accent-soft hover:underline">
          Sign in
        </Link>
      </p>
    </AuthCard>
  );
}
