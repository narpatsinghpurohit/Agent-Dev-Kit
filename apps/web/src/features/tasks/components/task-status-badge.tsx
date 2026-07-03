import type { TaskStatus } from '@repo/schemas';
import { STATUS_LABEL } from '../lib/format';

const STYLES: Record<TaskStatus, string> = {
  todo: 'bg-edge text-ink-dim',
  in_progress: 'bg-accent/20 text-accent-soft',
  done: 'bg-ok/15 text-ok',
};

/** Pure presentational leaf — single file by the standard, no split. */
export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STYLES[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}
