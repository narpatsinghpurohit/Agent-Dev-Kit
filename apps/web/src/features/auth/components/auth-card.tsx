import type { ReactNode } from 'react';

/** Pure presentational pieces shared by the auth screens — no split needed. */
export function AuthCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-xl border border-edge bg-panel p-8 shadow-xl">
        <h1 className="text-xl font-semibold">{title}</h1>
        <p className="mb-6 mt-1 text-sm text-ink-dim">{subtitle}</p>
        {children}
      </div>
    </div>
  );
}

export function FieldErrors({ errors }: { errors: unknown[] }) {
  if (errors.length === 0) return null;
  return (
    <span role="alert" className="text-xs text-danger">
      {errors
        .map((error) =>
          typeof error === 'string' ? error : ((error as { message?: string })?.message ?? ''),
        )
        .filter(Boolean)
        .join(', ')}
    </span>
  );
}

export const inputClass =
  'rounded-md border border-edge bg-surface px-3 py-2 text-ink outline-none focus:border-accent';
export const primaryButtonClass =
  'rounded-md bg-accent px-4 py-2 font-medium text-white hover:bg-accent-soft disabled:opacity-50';
