/**
 * View tests are the payoff of the split: pure props in, DOM out.
 * No providers, no MSW, no mocking of hooks.
 */
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Task } from '@repo/schemas';
// Views need providers only because <Link> reads router context — props
// stay plain data either way.
import { renderWithProviders } from '../../../shared/testing/test-utils';
import { TaskListView } from './task-list.view';

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: '507f1f77bcf86cd799439011',
    title: 'Write the docs',
    status: 'todo',
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
  } as Task;
}

function makeProps(overrides: Partial<Parameters<typeof TaskListView>[0]> = {}) {
  return {
    tasks: [makeTask()],
    statusFilter: undefined,
    isLoading: false,
    isError: false,
    hasNextPage: false,
    isFetchingNextPage: false,
    isMutating: false,
    onLoadMore: vi.fn(),
    onFilterChange: vi.fn(),
    onToggleStatus: vi.fn(),
    onDelete: vi.fn(),
    ...overrides,
  };
}

describe('TaskListView', () => {
  it('renders tasks with status badges', async () => {
    await renderWithProviders(<TaskListView {...makeProps()} />);
    expect(screen.getByText('Write the docs')).toBeInTheDocument();
    // 'To do' appears twice: the filter tab and the task's status badge.
    expect(screen.getAllByText('To do')).toHaveLength(2);
  });

  it('shows the empty state', async () => {
    await renderWithProviders(<TaskListView {...makeProps({ tasks: [] })} />);
    expect(screen.getByText(/Nothing here yet/)).toBeInTheDocument();
  });

  it('fires the filter callback', async () => {
    const props = makeProps();
    await renderWithProviders(<TaskListView {...props} />);
    await userEvent.click(screen.getByRole('tab', { name: 'Done' }));
    expect(props.onFilterChange).toHaveBeenCalledWith('done');
  });

  it('fires status toggle and delete callbacks', async () => {
    const props = makeProps();
    await renderWithProviders(<TaskListView {...props} />);
    await userEvent.click(screen.getByRole('button', { name: /Cycle status of Write the docs/ }));
    expect(props.onToggleStatus).toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: /Delete Write the docs/ }));
    expect(props.onDelete).toHaveBeenCalled();
  });

  it('renders the load-more affordance only when there is a next page', async () => {
    await renderWithProviders(<TaskListView {...makeProps({ hasNextPage: true })} />);
    expect(screen.getByRole('button', { name: 'Load more' })).toBeInTheDocument();
  });
});
