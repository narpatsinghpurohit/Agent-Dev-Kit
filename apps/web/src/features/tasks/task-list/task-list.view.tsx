import { Link } from '@tanstack/react-router';
import type { TaskStatus } from '@repo/schemas';
import { TaskStatusBadge } from '../components/task-status-badge';
import { formatDueDate, STATUS_LABEL } from '../lib/format';
import type { TaskListViewModel } from './task-list.hook';

const FILTERS: Array<TaskStatus | undefined> = [undefined, 'todo', 'in_progress', 'done'];

/** Pure props → JSX. No data imports — that is lint-enforced, not a convention. */
export function TaskListView({
  tasks,
  statusFilter,
  isLoading,
  isError,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
  onFilterChange,
  onToggleStatus,
  onDelete,
  isMutating,
}: TaskListViewModel) {
  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Tasks</h1>
        <Link
          to="/tasks/new"
          className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-soft"
        >
          New task
        </Link>
      </div>

      <div className="mb-4 flex gap-2" role="tablist" aria-label="Filter by status">
        {FILTERS.map((filter) => (
          <button
            key={filter ?? 'all'}
            type="button"
            role="tab"
            aria-selected={statusFilter === filter}
            onClick={() => onFilterChange(filter)}
            className={`rounded-full px-3 py-1 text-sm ${
              statusFilter === filter
                ? 'bg-accent text-white'
                : 'bg-panel text-ink-dim hover:text-ink'
            }`}
          >
            {filter ? STATUS_LABEL[filter] : 'All'}
          </button>
        ))}
      </div>

      {isLoading ? <p className="text-ink-dim">Loading…</p> : null}
      {isError ? (
        <p role="alert" className="text-danger">
          Could not load tasks.
        </p>
      ) : null}
      {!isLoading && tasks.length === 0 ? (
        <p className="rounded-lg border border-dashed border-edge p-8 text-center text-ink-dim">
          Nothing here yet — create a task, or ask the copilot to do it for you.
        </p>
      ) : null}

      <ul className="flex flex-col gap-2">
        {tasks.map((task) => (
          <li
            key={task.id}
            className="flex items-center gap-3 rounded-lg border border-edge bg-panel px-4 py-3"
          >
            <button
              type="button"
              onClick={() => onToggleStatus(task)}
              disabled={isMutating}
              title="Cycle status"
              aria-label={`Cycle status of ${task.title}`}
              className="text-lg"
            >
              {task.status === 'done' ? '✅' : task.status === 'in_progress' ? '🔵' : '⚪'}
            </button>
            <div className="min-w-0 flex-1">
              <Link
                to="/tasks/$taskId"
                params={{ taskId: task.id }}
                className={`block truncate font-medium hover:text-accent-soft ${
                  task.status === 'done' ? 'text-ink-dim line-through' : ''
                }`}
              >
                {task.title}
              </Link>
              {formatDueDate(task.dueDate) ? (
                <span className="text-xs text-ink-dim">due {formatDueDate(task.dueDate)}</span>
              ) : null}
            </div>
            <TaskStatusBadge status={task.status} />
            <button
              type="button"
              onClick={() => onDelete(task)}
              disabled={isMutating}
              aria-label={`Delete ${task.title}`}
              className="text-ink-dim hover:text-danger"
            >
              ✕
            </button>
          </li>
        ))}
      </ul>

      {hasNextPage ? (
        <button
          type="button"
          onClick={onLoadMore}
          disabled={isFetchingNextPage}
          className="mt-4 w-full rounded-md border border-edge py-2 text-sm text-ink-dim hover:text-ink"
        >
          {isFetchingNextPage ? 'Loading…' : 'Load more'}
        </button>
      ) : null}
    </div>
  );
}
