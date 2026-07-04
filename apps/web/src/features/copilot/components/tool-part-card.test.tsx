import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToolPartCard } from './tool-part-card';

describe('ToolPartCard', () => {
  it('renders the approval prompt and fires approve/deny', async () => {
    const onApproval = vi.fn();
    render(
      <ToolPartCard
        part={{
          type: 'tool-createPatient',
          state: 'approval-requested',
          input: { title: 'Ship it' },
          approval: { id: 'appr_1' },
        }}
        onApproval={onApproval}
      />,
    );

    expect(screen.getByText('Register patient')).toBeInTheDocument();
    expect(screen.getByText('needs approval')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Approve' }));
    expect(onApproval).toHaveBeenCalledWith('appr_1', true);

    await userEvent.click(screen.getByRole('button', { name: 'Deny' }));
    expect(onApproval).toHaveBeenCalledWith('appr_1', false);
  });

  it('shows completed state without approval UI', () => {
    render(
      <ToolPartCard
        part={{ type: 'tool-listPatients', state: 'output-available', input: {}, output: {} }}
        onApproval={vi.fn()}
      />,
    );
    expect(screen.getByText('done')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();
  });
});
