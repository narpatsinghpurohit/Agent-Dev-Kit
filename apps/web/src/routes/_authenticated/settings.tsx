import { createFileRoute, redirect } from '@tanstack/react-router';
import { getSettingsGetQueryOptions } from '@repo/api-client';
import { SettingsPage } from '../../features/settings';

/** Admin-only: runtime settings (copilot model/params, provider keys, CORS, flags). */
export const Route = createFileRoute('/_authenticated/settings')({
  beforeLoad: ({ context }) => {
    if (context.auth.getState().user?.role !== 'admin') {
      throw redirect({ to: '/tasks' });
    }
  },
  loader: ({ context }) => context.queryClient.ensureQueryData(getSettingsGetQueryOptions()),
  component: SettingsPage,
});
