import { createFileRoute, redirect } from '@tanstack/react-router';
import { AppShell } from '../features/shell';

/**
 * Pathless layout: everything nested under it requires a session. This guard
 * is UX-only — the API enforces authz on every endpoint regardless.
 */
export const Route = createFileRoute('/_authenticated')({
  beforeLoad: ({ context, location }) => {
    if (context.auth.getState().status !== 'authenticated') {
      throw redirect({ to: '/login', search: { redirect: location.href } });
    }
  },
  component: AppShell,
});
