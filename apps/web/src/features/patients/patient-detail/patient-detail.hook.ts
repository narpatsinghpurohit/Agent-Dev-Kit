import { useNavigate } from '@tanstack/react-router';
import { useCallback, useState } from 'react';
import {
  useConsultationsCreate,
  useConsultationsList,
  usePatientsGetSuspense,
} from '@repo/api-client';
import type { LanguageCode } from '@repo/schemas';
import { useInvalidatePatients } from '../patients-cache.hook';

/**
 * ViewModel for a patient's record: profile, past consultations, and the
 * "start consultation" action (which picks the DOCTOR's language — the
 * patient's language is on the profile).
 */
export function usePatientDetail(patientId: string) {
  const navigate = useNavigate();
  const invalidate = useInvalidatePatients();
  const { data: patient } = usePatientsGetSuspense(patientId);
  const consultationsQuery = useConsultationsList({ patientId, limit: 20 });
  const createMutation = useConsultationsCreate();
  const [doctorLanguage, setDoctorLanguage] = useState<LanguageCode>('en-IN');
  const [serverError, setServerError] = useState<string | null>(null);

  const onStartConsultation = useCallback(async () => {
    setServerError(null);
    try {
      const consultation = await createMutation.mutateAsync({
        data: { patientId, doctorLanguage },
      });
      await invalidate();
      await navigate({
        to: '/consultations/$consultationId',
        params: { consultationId: consultation.id },
      });
    } catch (error) {
      setServerError(error instanceof Error ? error.message : 'Could not start a consultation');
    }
  }, [createMutation, doctorLanguage, invalidate, navigate, patientId]);

  return {
    patient,
    consultations: consultationsQuery.data?.items ?? [],
    consultationsLoading: consultationsQuery.isLoading,
    doctorLanguage,
    serverError,
    isStarting: createMutation.isPending,
    onDoctorLanguageChange: setDoctorLanguage,
    onStartConsultation,
  };
}

export type PatientDetailViewModel = ReturnType<typeof usePatientDetail>;
