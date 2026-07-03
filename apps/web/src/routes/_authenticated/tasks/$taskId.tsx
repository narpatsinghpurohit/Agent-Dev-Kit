import { createFileRoute } from '@tanstack/react-router';
import { getTasksGetQueryOptions } from '@repo/api-client';
import { TaskDetailPage } from '../../../features/tasks';

export const Route = createFileRoute('/_authenticated/tasks/$taskId')({
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(getTasksGetQueryOptions(params.taskId)),
  component: TaskDetailRoute,
});

function TaskDetailRoute() {
  const { taskId } = Route.useParams();
  return <TaskDetailPage taskId={taskId} />;
}
