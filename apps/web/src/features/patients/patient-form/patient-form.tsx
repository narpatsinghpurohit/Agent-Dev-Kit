import { usePatientForm } from './patient-form.hook';
import { PatientFormView } from './patient-form.view';

export function PatientFormPage() {
  const viewModel = usePatientForm();
  return <PatientFormView {...viewModel} />;
}
