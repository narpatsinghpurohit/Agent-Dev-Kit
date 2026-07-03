import { createFileRoute, redirect } from '@tanstack/react-router';
import { SignupPage } from '../features/auth';

export const Route = createFileRoute('/signup')({
  beforeLoad: ({ context }) => {
    if (context.auth.getState().status === 'authenticated') {
      throw redirect({ to: '/tasks' });
    }
  },
  component: SignupPage,
});
