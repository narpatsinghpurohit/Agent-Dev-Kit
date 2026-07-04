import { useForm } from '@tanstack/react-form';
import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { usePatientsCreate } from '@repo/api-client';
import { PatientCreateSchema, type LanguageCode, type Sex } from '@repo/schemas';
import { useInvalidatePatients } from '../patients-cache.hook';

/**
 * ViewModel for registering a patient. Numeric fields are edited as strings
 * and parsed on submit through the SAME PatientCreateSchema the API enforces.
 */
export function usePatientForm() {
  const navigate = useNavigate();
  const invalidate = useInvalidatePatients();
  const createMutation = usePatientsCreate();
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm({
    defaultValues: {
      name: '',
      age: '',
      sex: 'female' as Sex,
      language: 'hi-IN' as LanguageCode,
      phone: '',
      notes: '',
    },
    onSubmit: async ({ value }) => {
      setServerError(null);
      const candidate = {
        name: value.name.trim(),
        age: Number(value.age),
        sex: value.sex,
        language: value.language,
        ...(value.phone.trim() ? { phone: value.phone.trim() } : {}),
        ...(value.notes.trim() ? { notes: value.notes.trim() } : {}),
      };
      const parsed = PatientCreateSchema.safeParse(candidate);
      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        setServerError(`${issue?.path.join('.')}: ${issue?.message}`);
        return;
      }
      try {
        const patient = await createMutation.mutateAsync({ data: parsed.data });
        await invalidate();
        await navigate({ to: '/patients/$patientId', params: { patientId: patient.id } });
      } catch (error) {
        setServerError(error instanceof Error ? error.message : 'Could not save the patient');
      }
    },
  });

  return {
    form,
    serverError,
    isSaving: createMutation.isPending,
    onCancel: () => void navigate({ to: '/patients' }),
  };
}

export type PatientFormViewModel = ReturnType<typeof usePatientForm>;
