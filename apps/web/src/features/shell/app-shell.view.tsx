import { Link } from '@tanstack/react-router';
import { LayoutDashboard, LogOut, Settings, Sparkles, Users } from 'lucide-react';
import type { ReactNode } from 'react';
import { Avatar, AvatarFallback } from '../../components/ui/avatar';
import { Button } from '../../components/ui/button';
import { Separator } from '../../components/ui/separator';
import { cn } from '../../lib/utils';
import { CopilotPanel } from '../copilot';
import type { AppShellViewModel } from './app-shell.hook';

const railLinkClass = 'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm [&_svg]:size-4';
const railLinkActive = { className: 'bg-accent-soft font-medium text-accent' };
const railLinkInactive = { className: 'text-ink-dim hover:bg-muted hover:text-ink' };

/** "Rekha Sharma" → "RS"; single names fall back to their first two letters. */
function initialsOf(name: string) {
  const [first = '', ...rest] = name.trim().split(/\s+/).filter(Boolean);
  if (!first) return '?';
  const last = rest.at(-1);
  return (last ? `${first.charAt(0)}${last.charAt(0)}` : first.slice(0, 2)).toUpperCase();
}

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
      <header className="flex h-14 shrink-0 items-center gap-4 border-b border-edge bg-panel px-5">
        <Link to="/dashboard" className="text-lg font-bold tracking-tight">
          vedita<span className="text-accent">.</span>
          <span className="font-semibold text-ink-dim">ai</span>
        </Link>
        <Separator orientation="vertical" className="data-[orientation=vertical]:h-5" />
        <span className="text-[13px] text-ink-dim">
          Shri Dhanvantari AYUSH Wellness Centre · OPD 2
        </span>
        <div className="flex-1" />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onToggleCopilot}
          aria-pressed={copilotOpen}
          className={cn(
            'text-ink-dim',
            copilotOpen &&
              'border-transparent bg-accent-soft text-accent hover:bg-accent-soft hover:text-accent',
          )}
        >
          <Sparkles aria-hidden />
          Vedita
        </Button>
        <div className="flex items-center gap-2.5">
          <Avatar>
            <AvatarFallback className="bg-accent-soft text-accent">
              {initialsOf(userName)}
            </AvatarFallback>
          </Avatar>
          <span className="text-[13px] font-semibold">{userName}</span>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onLogout}
          className="text-ink-dim hover:text-ink"
        >
          <LogOut aria-hidden />
          Log out
        </Button>
      </header>
      <div className="flex min-h-0 flex-1">
        <aside className="flex w-[200px] shrink-0 flex-col gap-1 border-r border-edge bg-panel p-3">
          <Link
            to="/dashboard"
            className={railLinkClass}
            activeProps={railLinkActive}
            inactiveProps={railLinkInactive}
          >
            <LayoutDashboard aria-hidden />
            Dashboard
          </Link>
          <Link
            to="/patients"
            className={railLinkClass}
            activeProps={railLinkActive}
            inactiveProps={railLinkInactive}
          >
            <Users aria-hidden />
            Patients
          </Link>
          {isAdmin ? (
            <Link
              to="/settings"
              className={railLinkClass}
              activeProps={railLinkActive}
              inactiveProps={railLinkInactive}
            >
              <Settings aria-hidden />
              Settings
            </Link>
          ) : null}
        </aside>
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
