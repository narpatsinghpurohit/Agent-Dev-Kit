import { useTaskDetail } from './task-detail.hook';
import { TaskDetailView } from './task-detail.view';

export function TaskDetailPage({ taskId }: { taskId: string }) {
  const viewModel = useTaskDetail(taskId);
  return <TaskDetailView {...viewModel} />;
}
