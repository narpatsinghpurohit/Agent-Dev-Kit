import { createFileRoute } from '@tanstack/react-router';
import { PatientFormPage } from '../../../features/patients';

export const Route = createFileRoute('/_authenticated/patients/new')({
  component: PatientFormPage,
});
