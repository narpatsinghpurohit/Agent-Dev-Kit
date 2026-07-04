import { createFileRoute, redirect } from '@tanstack/react-router';
import { z } from 'zod';
import { getAuthConfigQueryOptions } from '@repo/api-client';
import { LoginPage } from '../features/auth';

export const Route = createFileRoute('/login')({
  validateSearch: z.object({
    redirect: z.string().optional(),
  }),
  beforeLoad: ({ context }) => {
    if (context.auth.getState().status === 'authenticated') {
      throw redirect({ to: '/dashboard' });
    }
  },
  // Same queryOptions the google-signin hook uses — no button pop-in.
  // Swallow failures: the password form must never be blocked by the
  // optional Google button's config fetch.
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(getAuthConfigQueryOptions()).catch(() => undefined),
  component: LoginRoute,
});

function LoginRoute() {
  const { redirect: redirectTo } = Route.useSearch();
  return <LoginPage redirectTo={redirectTo} />;
}
