import { createFileRoute } from '@tanstack/react-router';
import { getConsultationsListQueryOptions, getPatientsGetQueryOptions } from '@repo/api-client';
import { PatientDetailPage } from '../../../features/patients';

export const Route = createFileRoute('/_authenticated/patients/$patientId')({
  loader: ({ context, params }) =>
    Promise.all([
      context.queryClient.ensureQueryData(getPatientsGetQueryOptions(params.patientId)),
      context.queryClient.ensureQueryData(
        getConsultationsListQueryOptions({ patientId: params.patientId, limit: 20 }),
      ),
    ]),
  component: PatientDetailRoute,
});

function PatientDetailRoute() {
  const { patientId } = Route.useParams();
  return <PatientDetailPage patientId={patientId} />;
}
