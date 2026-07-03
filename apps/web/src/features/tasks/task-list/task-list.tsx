import type { TaskStatus } from '@repo/schemas';
import { useTaskList } from './task-list.hook';
import { TaskListView } from './task-list.view';

/** ~5-line container: the modern Container/Presentational split. */
export function TaskListPage({ statusFilter }: { statusFilter?: TaskStatus }) {
  const viewModel = useTaskList(statusFilter);
  return <TaskListView {...viewModel} />;
}
