import type { TaskStatus } from '@repo/schemas';

/** Pure functions — unit-testable without React. */
export function formatDueDate(iso: string | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: 'To do',
  in_progress: 'In progress',
  done: 'Done',
};

export function nextStatus(status: TaskStatus): TaskStatus {
  if (status === 'todo') return 'in_progress';
  if (status === 'in_progress') return 'done';
  return 'todo';
}
