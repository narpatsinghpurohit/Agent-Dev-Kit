import { createFileRoute, redirect } from '@tanstack/react-router';
import { getAuthConfigQueryOptions } from '@repo/api-client';
import { SignupPage } from '../features/auth';

export const Route = createFileRoute('/signup')({
  beforeLoad: ({ context }) => {
    if (context.auth.getState().status === 'authenticated') {
      throw redirect({ to: '/tasks' });
    }
  },
  // Same queryOptions the google-signin hook uses — no button pop-in.
  // Swallow failures: the password form must never be blocked by the
  // optional Google button's config fetch.
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(getAuthConfigQueryOptions()).catch(() => undefined),
  component: SignupPage,
});
