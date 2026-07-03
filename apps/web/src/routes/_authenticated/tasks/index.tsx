import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { getTasksListQueryOptions } from '@repo/api-client';
import { TaskListPage } from '../../../features/tasks';

const searchSchema = z.object({
  status: z.enum(['todo', 'in_progress', 'done']).optional(),
});

/**
 * Routes stay pure config: typed search params, a loader that prefetches
 * through the SAME generated queryOptions the feature hook uses (one cache
 * entry — no double fetch), and a feature page render.
 */
export const Route = createFileRoute('/_authenticated/tasks/')({
  validateSearch: searchSchema,
  loaderDeps: ({ search }) => ({ status: search.status }),
  loader: ({ context, deps }) =>
    context.queryClient.ensureQueryData(
      getTasksListQueryOptions({ status: deps.status, limit: 20 }),
    ),
  component: TasksIndexRoute,
});

function TasksIndexRoute() {
  const search = Route.useSearch();
  return <TaskListPage statusFilter={search.status} />;
}
