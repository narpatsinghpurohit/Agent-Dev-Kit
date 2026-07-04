import { screen } from '@testing-library/react';
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
    expect(screen.getByRole('link', { name: /vedita/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Patients' })).toBeInTheDocument();
    expect(screen.getByText('Demo User')).toBeInTheDocument();
    expect(screen.getByText('DU')).toBeInTheDocument();
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
