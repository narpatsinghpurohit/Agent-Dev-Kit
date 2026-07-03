import { useForm } from '@tanstack/react-form';
import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { useTasksCreate, useTasksUpdate } from '@repo/api-client';
import { TaskCreateSchema, type Task } from '@repo/schemas';
import { useInvalidateTasks } from '../tasks-cache.hook';

/**
 * One form ViewModel for both create and edit — the client validates with
 * the SAME zod schema the API enforces (@repo/schemas), so users see
 * identical rules before and after the network.
 */
export function useTaskForm(task?: Task, onDone?: () => void) {
  const invalidate = useInvalidateTasks();
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);

  const createMutation = useTasksCreate();
  const updateMutation = useTasksUpdate();

  const form = useForm({
    defaultValues: {
      title: task?.title ?? '',
      description: task?.description ?? '',
      dueDate: task?.dueDate ? task.dueDate.slice(0, 10) : '',
    },
    onSubmit: async ({ value }) => {
      setServerError(null);
      const payload = {
        title: value.title,
        description: value.description || undefined,
        dueDate: value.dueDate ? new Date(`${value.dueDate}T23:59:59`).toISOString() : undefined,
      };
      const parsed = TaskCreateSchema.safeParse(payload);
      if (!parsed.success) {
        setServerError(parsed.error.issues[0]?.message ?? 'Invalid input');
        return;
      }
      try {
        if (task) {
          await updateMutation.mutateAsync({ id: task.id, data: parsed.data });
          await invalidate();
          onDone?.();
        } else {
          const created = await createMutation.mutateAsync({ data: parsed.data });
          await invalidate();
          await navigate({ to: '/tasks/$taskId', params: { taskId: created.id } });
        }
      } catch (error) {
        setServerError(error instanceof Error ? error.message : 'Saving failed');
      }
    },
  });

  return {
    form,
    serverError,
    isEdit: Boolean(task),
    onCancel: onDone ?? (() => void navigate({ to: '/tasks' })),
  };
}

export type TaskFormViewModel = ReturnType<typeof useTaskForm>;
