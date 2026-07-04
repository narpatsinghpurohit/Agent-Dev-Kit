import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../shared/testing/test-utils';
import { AppShellView } from './app-shell.view';

function makeProps(overrides: Partial<Parameters<typeof AppShellView>[0]> = {}) {
  return {
    userName: 'Demo User',
    isAdmin: false,
    copilotOpen: false,
    onToggleCopilot: vi.fn(),
    onLogout: vi.fn(),
    children: <p>content</p>,
    ...overrides,
  };
}

describe('AppShellView', () => {
  it('renders the wordmark, nav rail, and user identity', async () => {
    await renderWithProviders(<AppShellView {...makeProps()} />);
    expect(screen.getByRole('link', { name: /vedita/i })).toHaveAttribute('href', '/dashboard');
    expect(screen.getByRole('link', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Patients' })).toBeInTheDocument();
    expect(screen.getByText('Demo User')).toBeInTheDocument();
    expect(screen.getByText('DU')).toBeInTheDocument();
  });

  it('puts the dashboard link first in the nav rail', async () => {
    await renderWithProviders(<AppShellView {...makeProps({ isAdmin: true })} />);
    const rail = screen.getAllByRole('complementary')[0];
    const railLinks = within(rail as HTMLElement).getAllByRole('link');
    expect(railLinks.map((link) => link.textContent)).toEqual([
      'Dashboard',
      'Patients',
      'Settings',
    ]);
  });

  it('hides the settings link from members', async () => {
    await renderWithProviders(<AppShellView {...makeProps()} />);
    expect(screen.queryByRole('link', { name: 'Settings' })).not.toBeInTheDocument();
  });

  it('shows the settings link to admins', async () => {
    await renderWithProviders(<AppShellView {...makeProps({ isAdmin: true })} />);
    expect(screen.getByRole('link', { name: 'Settings' })).toBeInTheDocument();
  });

  it('toggles the copilot from the Vedita button', async () => {
    const props = makeProps();
    await renderWithProviders(<AppShellView {...props} />);
    const toggle = screen.getByRole('button', { name: 'Vedita' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(toggle);
    expect(props.onToggleCopilot).toHaveBeenCalledOnce();
  });

  it('renders the copilot panel only when open', async () => {
    await renderWithProviders(<AppShellView {...makeProps()} />);
    expect(screen.queryByTestId('copilot-panel')).not.toBeInTheDocument();
  });

  it('mounts the copilot panel when open', async () => {
    await renderWithProviders(<AppShellView {...makeProps({ copilotOpen: true })} />);
    expect(screen.getByTestId('copilot-panel')).toBeInTheDocument();
  });
});
