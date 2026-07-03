import { Outlet } from '@tanstack/react-router';
import { useAppShell } from './app-shell.hook';
import { AppShellView } from './app-shell.view';

/** Authenticated layout: header + content + the copilot side panel. */
export function AppShell() {
  const viewModel = useAppShell();
  return (
    <AppShellView {...viewModel}>
      <Outlet />
    </AppShellView>
  );
}
