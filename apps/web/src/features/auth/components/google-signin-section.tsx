import type { GoogleSigninViewModel } from '../google-signin/google-signin.hook';

/**
 * Pure section under the auth forms. Google renders the actual button into
 * the container div (it is an iframe — Tailwind cannot style it); hidden
 * entirely when no client ID is configured, so the kit stays keyless.
 */
export function GoogleSigninSection({ enabled, buttonRef, error }: GoogleSigninViewModel) {
  if (!enabled) return null;
  return (
    <div className="mt-4 flex flex-col gap-3">
      <div className="flex items-center gap-3 text-xs text-ink-dim">
        <span className="h-px flex-1 bg-edge" aria-hidden />
        or
        <span className="h-px flex-1 bg-edge" aria-hidden />
      </div>
      <div ref={buttonRef} className="flex justify-center" data-testid="google-signin" />
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
