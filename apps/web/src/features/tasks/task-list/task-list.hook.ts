import { useNavigate } from '@tanstack/react-router';
import { useCallback } from 'react';
import { useTasksListInfinite, useTasksRemove, useTasksUpdate } from '@repo/api-client';
import type { Task, TaskStatus } from '@repo/schemas';
import { nextStatus } from '../lib/format';
import { useInvalidateTasks } from '../tasks-cache.hook';

const PAGE_SIZE = 20;

/**
 * ViewModel for the task list: composes the generated infinite query with
 * mutations, cache invalidation, and URL-backed filter state. Returns one
 * typed object — the view renders it and nothing else.
 */
export function useTaskList(statusFilter: TaskStatus | undefined) {
  const invalidate = useInvalidateTasks();
  const navigate = useNavigate();

  const query = useTasksListInfinite(
    { status: statusFilter, limit: PAGE_SIZE },
    {
      query: {
        initialPageParam: undefined,
        getNextPageParam: (lastPage: { nextCursor: string | null }) =>
          lastPage.nextCursor ?? undefined,
      },
    },
  );

  const updateMutation = useTasksUpdate({ mutation: { onSuccess: invalidate } });
  const removeMutation = useTasksRemove({ mutation: { onSuccess: invalidate } });

  const tasks: Task[] = query.data?.pages.flatMap((page) => page.items) ?? [];

  return {
    tasks,
    statusFilter,
    isLoading: query.isLoading,
    isError: query.isError,
    hasNextPage: query.hasNextPage ?? false,
    isFetchingNextPage: query.isFetchingNextPage,
    onLoadMore: useCallback(() => void query.fetchNextPage(), [query]),
    onFilterChange: useCallback(
      (status: TaskStatus | undefined) =>
        void navigate({ to: '/tasks', search: status ? { status } : {} }),
      [navigate],
    ),
    onToggleStatus: useCallback(
      (task: Task) =>
        updateMutation.mutate({ id: task.id, data: { status: nextStatus(task.status) } }),
      [updateMutation],
    ),
    onDelete: useCallback((task: Task) => removeMutation.mutate({ id: task.id }), [removeMutation]),
    isMutating: updateMutation.isPending || removeMutation.isPending,
  };
}

export type TaskListViewModel = ReturnType<typeof useTaskList>;
