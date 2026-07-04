import { createFileRoute } from '@tanstack/react-router';
import { getConsultationsGetQueryOptions } from '@repo/api-client';
import { InterviewPage } from '../../../features/consultation';

export const Route = createFileRoute('/_authenticated/consultations/$consultationId')({
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(getConsultationsGetQueryOptions(params.consultationId)),
  component: InterviewRoute,
});

function InterviewRoute() {
  const { consultationId } = Route.useParams();
  return <InterviewPage consultationId={consultationId} />;
}
