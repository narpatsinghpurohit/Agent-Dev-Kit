import { Link } from '@tanstack/react-router';
import { inputClass, primaryButtonClass } from '../../../components/form-styles';
import { AuthCard, FieldErrors } from '../components/auth-card';
import { GoogleSigninSection } from '../components/google-signin-section';
import type { LoginViewModel } from './login.hook';

export function LoginView({ form, serverError, google }: LoginViewModel) {
  return (
    <AuthCard title="Welcome back" subtitle="Sign in to your workspace">
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
      >
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
                autoComplete="current-password"
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
              {isSubmitting ? 'Signing in…' : 'Sign in'}
            </button>
          )}
        </form.Subscribe>
      </form>
      <GoogleSigninSection {...google} />
      <p className="mt-4 text-sm text-ink-dim">
        No account?{' '}
        <Link to="/signup" className="text-accent-soft hover:underline">
          Create one
        </Link>
      </p>
    </AuthCard>
  );
}
