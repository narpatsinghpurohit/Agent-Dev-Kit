import { createFileRoute, redirect } from '@tanstack/react-router';
import { z } from 'zod';
import { LoginPage } from '../features/auth';

export const Route = createFileRoute('/login')({
  validateSearch: z.object({
    redirect: z.string().optional(),
  }),
  beforeLoad: ({ context }) => {
    if (context.auth.getState().status === 'authenticated') {
      throw redirect({ to: '/tasks' });
    }
  },
  component: LoginRoute,
});

function LoginRoute() {
  const { redirect: redirectTo } = Route.useSearch();
  return <LoginPage redirectTo={redirectTo} />;
}
