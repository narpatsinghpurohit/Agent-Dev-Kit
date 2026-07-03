import { useNavigate } from '@tanstack/react-router';
import { useCallback, useState, useSyncExternalStore } from 'react';
import { authStore, logout } from '../../lib/auth';

export interface AppShellViewModel {
  userName: string;
  isAdmin: boolean;
  copilotOpen: boolean;
  onToggleCopilot: () => void;
  onLogout: () => void;
}

export function useAppShell(): AppShellViewModel {
  const auth = useSyncExternalStore(authStore.subscribe, authStore.getState);
  const [copilotOpen, setCopilotOpen] = useState(false);
  const navigate = useNavigate();

  const onLogout = useCallback(() => {
    void logout().then(() => navigate({ to: '/login' }));
  }, [navigate]);

  return {
    userName: auth.user?.name ?? '',
    isAdmin: auth.user?.role === 'admin',
    copilotOpen,
    onToggleCopilot: useCallback(() => setCopilotOpen((open) => !open), []),
    onLogout,
  };
}
