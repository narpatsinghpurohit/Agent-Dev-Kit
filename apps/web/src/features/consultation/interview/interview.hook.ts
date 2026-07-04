import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getConsultationsGetQueryKey,
  useConsultationsAnswer,
  useConsultationsAnswerText,
  useConsultationsAsk,
  useConsultationsFinish,
  useConsultationsGetSuspense,
  useConsultationsUpdateSummary,
  usePatientsGet,
} from '@repo/api-client';
import { ConsultationSummarySchema, type ConsultationSummary } from '@repo/schemas';
import { useInvalidatePatients } from '../../patients/patients-cache.hook';

/**
 * ViewModel for the assisted interview. The loop:
 *   doctor types (or dictates) a question → API translates + speaks it →
 *   audio plays for the patient → patient answers by push-to-talk mic
 *   (or the typed fallback) → API transcribes + translates back.
 * Finishing drafts the structured summary, which the doctor edits in place.
 */
export function useInterview(consultationId: string) {
  const queryClient = useQueryClient();
  const { data: consultation } = useConsultationsGetSuspense(consultationId);
  const patientQuery = usePatientsGet(consultation.patientId);

  const [question, setQuestion] = useState('');
  const [patientText, setPatientText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const unmountedRef = useRef(false);

  // Leaving the page mid-recording must release the microphone AND must not
  // submit a stray answer to a consultation the doctor already left.
  useEffect(() => {
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
      const recorder = recorderRef.current;
      if (recorder) {
        recorderRef.current = null;
        for (const track of recorder.stream.getTracks()) track.stop();
        if (recorder.state !== 'inactive') recorder.stop();
      }
    };
  }, []);

  const askMutation = useConsultationsAsk();
  const answerMutation = useConsultationsAnswer();
  const answerTextMutation = useConsultationsAnswerText();
  const finishMutation = useConsultationsFinish();
  const summaryMutation = useConsultationsUpdateSummary();

  const invalidateLists = useInvalidatePatients();

  const refresh = useCallback(async () => {
    // invalidateQueries refetches the active detail query itself; the list
    // invalidation covers the patient page (30s staleTime would otherwise
    // serve the pre-interview list there).
    await queryClient.invalidateQueries({
      queryKey: getConsultationsGetQueryKey(consultationId),
    });
    await invalidateLists();
  }, [consultationId, invalidateLists, queryClient]);

  const playWav = useCallback((base64: string) => {
    const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: 'audio/wav' }));
    const audio = new Audio(url);
    audio.onended = () => URL.revokeObjectURL(url);
    void audio.play().catch(() => URL.revokeObjectURL(url));
  }, []);

  const onAsk = useCallback(async () => {
    const text = question.trim();
    if (!text) return;
    setError(null);
    try {
      const result = await askMutation.mutateAsync({ id: consultationId, data: { text } });
      setQuestion('');
      await refresh();
      // Speak the translated question to the patient.
      if (result.audioBase64) playWav(result.audioBase64);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not send the question');
    }
  }, [askMutation, consultationId, playWav, question, refresh]);

  const onAnswerText = useCallback(async () => {
    const text = patientText.trim();
    if (!text) return;
    setError(null);
    try {
      await answerTextMutation.mutateAsync({ id: consultationId, data: { text } });
      setPatientText('');
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not record the answer');
    }
  }, [answerTextMutation, consultationId, patientText, refresh]);

  /** Push-to-talk: first tap starts recording, second tap stops + submits. */
  const onToggleRecording = useCallback(async () => {
    if (recorderRef.current) {
      recorderRef.current.stop();
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) return;
    setError(null);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError('Microphone unavailable — check the browser permission, or type the answer.');
      return;
    }
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/mp4';
    const recorder = new MediaRecorder(stream, { mimeType });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (event) => chunks.push(event.data);
    recorder.onstop = () => {
      // Unmount cleanup already nulled the ref and stopped the tracks —
      // drop the clip instead of submitting to a page the doctor left.
      const active = recorderRef.current === recorder;
      recorderRef.current = null;
      for (const track of stream.getTracks()) track.stop();
      if (!active || unmountedRef.current) return;
      setIsRecording(false);
      const audio = new Blob(chunks, { type: mimeType });
      answerMutation
        .mutateAsync({ id: consultationId, data: { audio } })
        .then(() => refresh())
        .catch((cause: unknown) => {
          if (unmountedRef.current) return;
          setError(cause instanceof Error ? cause.message : 'Could not understand the recording');
        });
    };
    recorderRef.current = recorder;
    setIsRecording(true);
    recorder.start();
    // Sarvam's real-time STT caps at ~30s — stop automatically before that.
    setTimeout(() => {
      if (recorderRef.current === recorder && recorder.state !== 'inactive') recorder.stop();
    }, 28_000);
  }, [answerMutation, consultationId, refresh]);

  const onFinish = useCallback(async () => {
    setError(null);
    try {
      await finishMutation.mutateAsync({ id: consultationId });
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not finish the consultation');
    }
  }, [consultationId, finishMutation, refresh]);

  const onSaveSummary = useCallback(
    async (summary: ConsultationSummary) => {
      setError(null);
      const parsed = ConsultationSummarySchema.safeParse(summary);
      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        setError(`${issue?.path.join('.')}: ${issue?.message}`);
        return false;
      }
      try {
        await summaryMutation.mutateAsync({ id: consultationId, data: parsed.data });
        await refresh();
        return true;
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Could not save the summary');
        return false;
      }
    },
    [consultationId, refresh, summaryMutation],
  );

  return {
    consultation,
    patient: patientQuery.data ?? null,
    question,
    patientText,
    error,
    isRecording,
    isAsking: askMutation.isPending,
    isAnswering: answerMutation.isPending || answerTextMutation.isPending,
    isFinishing: finishMutation.isPending,
    isSavingSummary: summaryMutation.isPending,
    micAvailable: typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices),
    onQuestionChange: setQuestion,
    onPatientTextChange: setPatientText,
    onAsk,
    onAnswerText,
    onToggleRecording,
    onFinish,
    onSaveSummary,
  };
}

export type InterviewViewModel = ReturnType<typeof useInterview>;
