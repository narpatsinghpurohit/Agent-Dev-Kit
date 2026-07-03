import type { TaskStatus } from '@repo/schemas';
import { TaskStatusBadge } from '../components/task-status-badge';
import { formatDueDate, STATUS_LABEL } from '../lib/format';
import { TaskFormPanel } from '../task-form/task-form';
import type { TaskDetailViewModel } from './task-detail.hook';

const ALL_STATUSES: TaskStatus[] = ['todo', 'in_progress', 'done'];

export function TaskDetailView({
  task,
  editing,
  isMutating,
  onStartEdit,
  onCancelEdit,
  onChangeStatus,
  onDelete,
  onBack,
}: TaskDetailViewModel) {
  return (
    <div className="mx-auto max-w-2xl">
      <button type="button" onClick={onBack} className="mb-4 text-sm text-ink-dim hover:text-ink">
        ← Back to tasks
      </button>

      {editing ? (
        <TaskFormPanel task={task} onDone={onCancelEdit} />
      ) : (
        <div className="rounded-xl border border-edge bg-panel p-6">
          <div className="mb-2 flex items-start justify-between gap-4">
            <h1 className="text-xl font-semibold">{task.title}</h1>
            <TaskStatusBadge status={task.status} />
          </div>
          {task.description ? (
            <p className="mb-4 whitespace-pre-wrap text-ink-dim">{task.description}</p>
          ) : null}
          {formatDueDate(task.dueDate) ? (
            <p className="mb-4 text-sm text-ink-dim">Due {formatDueDate(task.dueDate)}</p>
          ) : null}

          <div className="mb-6 flex gap-2" role="group" aria-label="Set status">
            {ALL_STATUSES.map((status) => (
              <button
                key={status}
                type="button"
                disabled={isMutating || status === task.status}
                onClick={() => onChangeStatus(status)}
                className={`rounded-md px-3 py-1 text-sm ${
                  status === task.status
                    ? 'bg-accent text-white'
                    : 'border border-edge text-ink-dim hover:text-ink'
                }`}
              >
                {STATUS_LABEL[status]}
              </button>
            ))}
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onStartEdit}
              className="rounded-md border border-edge px-3 py-1.5 text-sm hover:border-accent"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={onDelete}
              disabled={isMutating}
              className="rounded-md border border-danger/40 px-3 py-1.5 text-sm text-danger hover:bg-danger/10"
            >
              Delete
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
