import { usePatientList } from './patient-list.hook';
import { PatientListView } from './patient-list.view';

export function PatientListPage() {
  const viewModel = usePatientList();
  return <PatientListView {...viewModel} />;
}
