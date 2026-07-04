import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { CopilotPanel } from '../copilot';
import type { AppShellViewModel } from './app-shell.hook';

export function AppShellView({
  userName,
  isAdmin,
  copilotOpen,
  onToggleCopilot,
  onLogout,
  children,
}: AppShellViewModel & { children: ReactNode }) {
  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center justify-between border-b border-edge bg-panel px-6 py-3">
        <div className="flex items-center gap-6">
          <Link to="/patients" className="text-lg font-semibold tracking-tight">
            Sahayak<span className="text-accent-soft"> Clinic</span>
          </Link>
          <nav className="flex gap-4 text-sm text-ink-dim">
            <Link
              to="/patients"
              className="hover:text-ink"
              activeProps={{ className: 'text-ink font-medium' }}
            >
              Patients
            </Link>
            {isAdmin ? (
              <Link
                to="/settings"
                className="hover:text-ink"
                activeProps={{ className: 'text-ink font-medium' }}
              >
                Settings
              </Link>
            ) : null}
          </nav>
        </div>
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={onToggleCopilot}
            aria-pressed={copilotOpen}
            className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-soft"
          >
            {copilotOpen ? 'Close copilot' : '✦ Copilot'}
          </button>
          <span className="text-sm text-ink-dim">{userName}</span>
          <button
            type="button"
            onClick={onLogout}
            className="text-sm text-ink-dim underline-offset-4 hover:text-ink hover:underline"
          >
            Log out
          </button>
        </div>
      </header>
      <div className="flex min-h-0 flex-1">
        <main className="min-w-0 flex-1 overflow-y-auto p-6">{children}</main>
        {copilotOpen ? (
          <aside className="flex w-96 shrink-0 flex-col border-l border-edge bg-panel">
            <CopilotPanel />
          </aside>
        ) : null}
      </div>
    </div>
  );
}
