import { createFileRoute } from '@tanstack/react-router';
import { TaskCreatePage } from '../../../features/tasks';

export const Route = createFileRoute('/_authenticated/tasks/new')({
  component: TaskCreatePage,
});
