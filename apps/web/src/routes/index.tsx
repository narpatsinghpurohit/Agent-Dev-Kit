import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/')({
  beforeLoad: ({ context }) => {
    const { status } = context.auth.getState();
    throw redirect({ to: status === 'authenticated' ? '/patients' : '/login' });
  },
});
