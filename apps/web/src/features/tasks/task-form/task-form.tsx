import type { Task } from '@repo/schemas';
import { useTaskForm } from './task-form.hook';
import { TaskFormView } from './task-form.view';

/** Create page (route-level). */
export function TaskCreatePage() {
  const viewModel = useTaskForm();
  return (
    <div className="mx-auto max-w-2xl">
      <TaskFormView {...viewModel} />
    </div>
  );
}

/** Edit panel (embedded in the detail screen). */
export function TaskFormPanel({ task, onDone }: { task: Task; onDone: () => void }) {
  const viewModel = useTaskForm(task, onDone);
  return <TaskFormView {...viewModel} />;
}
