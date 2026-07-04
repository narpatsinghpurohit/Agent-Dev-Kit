import { usePatientDetail } from './patient-detail.hook';
import { PatientDetailView } from './patient-detail.view';

export function PatientDetailPage({ patientId }: { patientId: string }) {
  const viewModel = usePatientDetail(patientId);
  return <PatientDetailView {...viewModel} />;
}
