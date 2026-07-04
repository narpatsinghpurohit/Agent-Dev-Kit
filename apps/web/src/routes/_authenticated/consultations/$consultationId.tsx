import { createFileRoute } from '@tanstack/react-router';
import {
  getAlertsListQueryOptions,
  getConsultationsGetQueryOptions,
  getPatientsGetClinicalQueryOptions,
  getPatientsGetQueryOptions,
  getQueueListQueryOptions,
  getVitalsListQueryOptions,
} from '@repo/api-client';
import { ConsolePage } from '../../../features/consultation';

export const Route = createFileRoute('/_authenticated/consultations/$consultationId')({
  loader: async ({ context, params }) => {
    // The consultation gates the suspense hook; the context queries (patient,
    // clinical, vitals, queue, alerts) are cheap prefetches — the console
    // renders without them and fills in as they land.
    const consultation = await context.queryClient.ensureQueryData(
      getConsultationsGetQueryOptions(params.consultationId),
    );
    void context.queryClient.prefetchQuery(getPatientsGetQueryOptions(consultation.patientId));
    void context.queryClient.prefetchQuery(
      getPatientsGetClinicalQueryOptions(consultation.patientId),
    );
    void context.queryClient.prefetchQuery(getVitalsListQueryOptions(consultation.patientId));
    void context.queryClient.prefetchQuery(getQueueListQueryOptions());
    void context.queryClient.prefetchQuery(getAlertsListQueryOptions());
  },
  component: ConsoleRoute,
});

function ConsoleRoute() {
  const { consultationId } = Route.useParams();
  return <ConsolePage consultationId={consultationId} />;
}
