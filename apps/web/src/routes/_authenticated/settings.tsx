import { createFileRoute, redirect } from '@tanstack/react-router';
import { getChatModelsQueryOptions, getSettingsGetQueryOptions } from '@repo/api-client';
import { SettingsPage } from '../../features/settings';

/** Admin-only: runtime settings (copilot model/params, provider keys, CORS, flags). */
export const Route = createFileRoute('/_authenticated/settings')({
  beforeLoad: ({ context }) => {
    if (context.auth.getState().user?.role !== 'admin') {
      throw redirect({ to: '/patients' });
    }
  },
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(getSettingsGetQueryOptions()),
      // The hook suspends on the effective feature→model map too.
      context.queryClient.ensureQueryData(getChatModelsQueryOptions()),
    ]),
  component: SettingsPage,
});
