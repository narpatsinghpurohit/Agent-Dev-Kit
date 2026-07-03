import { useNavigate } from '@tanstack/react-router';
import { useCallback, useState } from 'react';
import { useTasksGetSuspense, useTasksRemove, useTasksUpdate } from '@repo/api-client';
import type { TaskStatus } from '@repo/schemas';
import { useInvalidateTasks } from '../tasks-cache.hook';

/**
 * Detail ViewModel. The route loader already ensured this query, so the
 * suspense hook renders synchronously from cache on first paint.
 */
export function useTaskDetail(taskId: string) {
  const invalidate = useInvalidateTasks();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);

  const { data: task } = useTasksGetSuspense(taskId);

  const updateMutation = useTasksUpdate({
    mutation: {
      onSuccess: async () => {
        await invalidate();
        setEditing(false);
      },
    },
  });
  const removeMutation = useTasksRemove({
    mutation: {
      onSuccess: async () => {
        await invalidate();
        await navigate({ to: '/tasks' });
      },
    },
  });

  return {
    task,
    editing,
    isMutating: updateMutation.isPending || removeMutation.isPending,
    onStartEdit: useCallback(() => setEditing(true), []),
    onCancelEdit: useCallback(() => setEditing(false), []),
    onChangeStatus: useCallback(
      (status: TaskStatus) => updateMutation.mutate({ id: taskId, data: { status } }),
      [updateMutation, taskId],
    ),
    onDelete: useCallback(() => {
      removeMutation.mutate({ id: taskId });
    }, [removeMutation, taskId]),
    onBack: useCallback(() => void navigate({ to: '/tasks' }), [navigate]),
  };
}

export type TaskDetailViewModel = ReturnType<typeof useTaskDetail>;
