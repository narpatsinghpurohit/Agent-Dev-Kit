import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  getAlertsListQueryKey,
  getConsultationsGetQueryKey,
  useAlertsDismiss,
  useAlertsList,
  useConsultationsAhmisSign,
  useConsultationsAnswer,
  useConsultationsAnswerText,
  useConsultationsAsk,
  useConsultationsFinish,
  useConsultationsGenerateTreatmentPlan,
  useConsultationsGetSuspense,
  useConsultationsInsight,
  useConsultationsQuickAsks,
  useConsultationsUpdateRecommendation,
  useConsultationsUpdateSummary,
  usePatientsGet,
  usePatientsGetClinical,
  useQueueList,
  useVitalsList,
} from '@repo/api-client';
import {
  ConsultationSummarySchema,
  type ConsultationSummary,
  type FieldMeta,
  type RecommendationUpdateInput,
  type Symptom,
  type Vital,
} from '@repo/schemas';
import { authStore } from '../../../lib/auth';
import { useInvalidatePatients } from '../../patients/patients-cache.hook';
import { fieldKeyLabel, formatElapsed, formatTimeHHMM, shortLanguageName } from './format';

export type RightTab = 'ehr' | 'plan';

/** One EHR-pane field card, pre-digested for pure rendering. */
export interface EhrField {
  key: string;
  label: string;
  value: string;
  /** null → manually entered (renders the muted "manual" tag instead of a score). */
  confidence: number | null;
  isNew: boolean;
  /** Italic source line, e.g. "from patient, 08:41" or "entered by doctor". */
  source: string;
}

/**
 * ViewModel for the live-consultation console. The interview loop is
 * preserved verbatim from the original screen:
 *   doctor types (or dictates) a question → API translates + speaks it →
 *   audio plays for the patient → patient answers by push-to-talk mic
 *   (or the typed fallback) → API transcribes + translates back.
 * Finishing drafts the structured summary AND kicks off treatment-plan
 * generation. Around that loop the console adds: clinical context, vitals
 * + trends, today's queue, outbreak alerts, quick-ask suggestions, private
 * Vedita insights, AHMIS signing, and the EHR/plan tab state.
 */
export function useConsole(consultationId: string) {
  const queryClient = useQueryClient();
  const auth = useSyncExternalStore(authStore.subscribe, authStore.getState);
  const { data: consultation } = useConsultationsGetSuspense(consultationId);
  const patientQuery = usePatientsGet(consultation.patientId);
  const clinicalQuery = usePatientsGetClinical(consultation.patientId);
  const vitalsQuery = useVitalsList(consultation.patientId);
  const queueQuery = useQueueList();
  const alertsQuery = useAlertsList();

  const [question, setQuestion] = useState('');
  const [patientText, setPatientText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [rightTab, setRightTab] = useState<RightTab>('ehr');
  const [quickAsks, setQuickAsks] = useState<string[]>([]);
  const recorderRef = useRef<MediaRecorder | null>(null);
  /** True while getUserMedia is pending — blocks a second overlapping start. */
  const startingRecorderRef = useRef(false);
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
  const planMutation = useConsultationsGenerateTreatmentPlan();
  const recommendationMutation = useConsultationsUpdateRecommendation();
  const quickAsksMutation = useConsultationsQuickAsks();
  const insightMutation = useConsultationsInsight();
  const ahmisMutation = useConsultationsAhmisSign();
  const alertDismissMutation = useAlertsDismiss();

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

  const inProgress = consultation.status === 'in_progress';

  // ── Elapsed mm:ss ticker (ticks only while in progress) ─────────────────
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!inProgress) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [inProgress]);
  const elapsedEnd = inProgress
    ? now
    : new Date(consultation.completedAt ?? consultation.updatedAt).getTime();
  const elapsed = formatElapsed(elapsedEnd - new Date(consultation.createdAt).getTime());

  // ── Quick-asks: on load (in_progress) and after each successful turn ────
  const { mutateAsync: quickAsksMutateAsync } = quickAsksMutation;
  const quickAsksBusyRef = useRef(false);
  const requestQuickAsks = useCallback(async () => {
    if (quickAsksBusyRef.current) return;
    quickAsksBusyRef.current = true;
    try {
      const result = await quickAsksMutateAsync({ id: consultationId });
      if (!unmountedRef.current) setQuickAsks(result.questions);
    } catch {
      // Suggestions are decorative — keep the last good set on failure.
    } finally {
      quickAsksBusyRef.current = false;
    }
  }, [consultationId, quickAsksMutateAsync]);

  const quickAsksLoadedRef = useRef(false);
  useEffect(() => {
    if (!inProgress || quickAsksLoadedRef.current) return;
    quickAsksLoadedRef.current = true;
    void requestQuickAsks();
  }, [inProgress, requestQuickAsks]);

  // ── Private insight: once per every 2nd patient turn ────────────────────
  // Deterministic rule: after the 2nd, 4th, … patient utterance, request one
  // insight. The existing-insight count makes remounts idempotent; the ref
  // guards double-fires between refetches. Failures are silently tolerated.
  const patientTurnCount = consultation.turns.filter((turn) => turn.speaker === 'patient').length;
  const insightTurnCount = consultation.turns.filter((turn) => turn.kind === 'insight').length;
  const { mutateAsync: insightMutateAsync } = insightMutation;
  const insightRequestedAtRef = useRef(0);
  useEffect(() => {
    if (!inProgress || patientTurnCount < 2 || patientTurnCount % 2 !== 0) return;
    if (insightTurnCount >= Math.floor(patientTurnCount / 2)) return;
    if (insightRequestedAtRef.current >= patientTurnCount) return;
    insightRequestedAtRef.current = patientTurnCount;
    insightMutateAsync({ id: consultationId })
      .then(() => refresh())
      .catch(() => undefined);
  }, [consultationId, inProgress, insightMutateAsync, insightTurnCount, patientTurnCount, refresh]);

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
      void requestQuickAsks();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not send the question');
    }
  }, [askMutation, consultationId, playWav, question, refresh, requestQuickAsks]);

  const onAnswerText = useCallback(async () => {
    const text = patientText.trim();
    if (!text) return;
    setError(null);
    try {
      await answerTextMutation.mutateAsync({ id: consultationId, data: { text } });
      setPatientText('');
      await refresh();
      void requestQuickAsks();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not record the answer');
    }
  }, [answerTextMutation, consultationId, patientText, refresh, requestQuickAsks]);

  /** Push-to-talk: first tap starts recording, second tap stops + submits. */
  const onToggleRecording = useCallback(async () => {
    if (recorderRef.current) {
      recorderRef.current.stop();
      return;
    }
    // A tap while getUserMedia is still pending (permission prompt open,
    // double-click) must not start a SECOND recorder — the losing one would
    // have no stop path and hold the microphone until page reload.
    if (startingRecorderRef.current) return;
    if (!navigator.mediaDevices?.getUserMedia) return;
    startingRecorderRef.current = true;
    setError(null);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      startingRecorderRef.current = false;
      setError('Microphone unavailable — check the browser permission, or type the answer.');
      return;
    }
    if (unmountedRef.current) {
      // The doctor left the page while the permission prompt was open.
      startingRecorderRef.current = false;
      for (const track of stream.getTracks()) track.stop();
      return;
    }
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/mp4';
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, { mimeType });
    } catch {
      // Construction failed — release the mic or it stays hot forever.
      startingRecorderRef.current = false;
      for (const track of stream.getTracks()) track.stop();
      setError('Recording is not supported in this browser — type the answer instead.');
      return;
    }
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
        .then(() => {
          if (!unmountedRef.current) void requestQuickAsks();
        })
        .catch((cause: unknown) => {
          if (unmountedRef.current) return;
          setError(cause instanceof Error ? cause.message : 'Could not understand the recording');
        });
    };
    recorderRef.current = recorder;
    startingRecorderRef.current = false;
    setIsRecording(true);
    recorder.start();
    // Sarvam's real-time STT caps at ~30s — stop automatically before that.
    setTimeout(() => {
      if (recorderRef.current === recorder && recorder.state !== 'inactive') recorder.stop();
    }, 28_000);
  }, [answerMutation, consultationId, refresh, requestQuickAsks]);

  // One flag across the WHOLE finish flow (finish → refetch → plan): the
  // mutation's own isPending drops while the refetch is still in flight,
  // which would briefly re-enable the Finish button on the stale
  // in_progress status — a second click then 400s with a false error.
  const [isFinishing, setIsFinishing] = useState(false);
  const onFinish = useCallback(async () => {
    if (isFinishing) return;
    setError(null);
    setIsFinishing(true);
    try {
      try {
        await finishMutation.mutateAsync({ id: consultationId });
        await refresh();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Could not finish the consultation');
        return;
      }
      // Draft the treatment plan right away. Failure is non-fatal — the plan
      // pane's empty state keeps a "Generate plan" button as the retry.
      try {
        await planMutation.mutateAsync({ id: consultationId });
        await refresh();
      } catch {
        // tolerated — see above
      }
    } finally {
      setIsFinishing(false);
    }
  }, [consultationId, finishMutation, isFinishing, planMutation, refresh]);

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

  const onGeneratePlan = useCallback(async () => {
    setError(null);
    try {
      await planMutation.mutateAsync({ id: consultationId });
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not generate the treatment plan');
    }
  }, [consultationId, planMutation, refresh]);

  const onRecommendationUpdate = useCallback(
    async (recId: string, state: RecommendationUpdateInput['state'], editedBody?: string) => {
      setError(null);
      try {
        await recommendationMutation.mutateAsync({
          id: consultationId,
          recId,
          data: { state, ...(editedBody ? { editedBody } : {}) },
        });
        await refresh();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Could not update the recommendation');
      }
    },
    [consultationId, recommendationMutation, refresh],
  );

  const onSignAhmis = useCallback(async () => {
    setError(null);
    try {
      await ahmisMutation.mutateAsync({ id: consultationId });
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not sign to AHMIS');
    }
  }, [ahmisMutation, consultationId, refresh]);

  const onDismissAlert = useCallback(
    async (alertId: string) => {
      try {
        await alertDismissMutation.mutateAsync({ id: alertId });
        await queryClient.invalidateQueries({ queryKey: getAlertsListQueryKey() });
      } catch {
        // Dismissal is best-effort — the banner simply stays.
      }
    },
    [alertDismissMutation, queryClient],
  );

  // ── Derived display data ─────────────────────────────────────────────────
  const vitals = vitalsQuery.data?.items ?? [];
  const latestVital = vitals[0] ?? null; // API returns newest-first
  const lastPatientTurn = consultation.turns.findLast((turn) => turn.speaker === 'patient');
  // Short native form ("हिन्दी") per the design — matches the context strip.
  const latestDetectedLanguage = shortLanguageName(
    lastPatientTurn?.sourceLanguage ?? consultation.patientLanguage,
  );
  const ehrFields = buildEhrFields(consultation.summary, latestVital);

  return {
    consultation,
    patient: patientQuery.data ?? null,
    clinical: clinicalQuery.data ?? null,
    vitals,
    vitalTrends: vitalsQuery.data?.trends ?? [],
    latestVital,
    queue: queueQuery.data?.items ?? [],
    alerts: alertsQuery.data?.items ?? [],
    quickAsks,
    ehrFields,
    capturedCount: ehrFields.length,
    rightTab,
    elapsed,
    latestDetectedLanguage,
    doctorName: auth.user?.name ?? '',
    question,
    patientText,
    error,
    isRecording,
    isAsking: askMutation.isPending,
    isAnswering: answerMutation.isPending || answerTextMutation.isPending,
    isFinishing,
    isSavingSummary: summaryMutation.isPending,
    isGeneratingPlan: planMutation.isPending,
    isUpdatingPlan: recommendationMutation.isPending,
    isSigning: ahmisMutation.isPending,
    micAvailable: typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices),
    onQuestionChange: setQuestion,
    onPatientTextChange: setPatientText,
    onQuickAsk: setQuestion,
    onRightTabChange: setRightTab,
    onAsk,
    onAnswerText,
    onToggleRecording,
    onFinish,
    onSaveSummary,
    onGeneratePlan,
    onRecommendationUpdate,
    onSignAhmis,
    onDismissAlert,
  };
}

export type ConsoleViewModel = ReturnType<typeof useConsole>;

// ── Pure derivation helpers ──────────────────────────────────────────────

function formatSymptom(symptom: Symptom): string {
  return [symptom.name, symptom.duration, symptom.severity, symptom.notes]
    .filter(Boolean)
    .join(' · ');
}

function formatVitalLine(vital: Vital): string {
  const parts: string[] = [];
  if (vital.systolic != null && vital.diastolic != null) {
    parts.push(`BP ${vital.systolic}/${vital.diastolic}`);
  }
  if (vital.pulse != null) parts.push(`Pulse ${vital.pulse}`);
  if (vital.weightKg != null) parts.push(`Weight ${vital.weightKg} kg`);
  return parts.join(' · ');
}

function metaToDisplay(
  meta: FieldMeta | undefined,
): Pick<EhrField, 'confidence' | 'isNew' | 'source'> {
  // Pre-provenance records render like manual entries: muted, source-less.
  if (!meta) return { confidence: null, isNew: false, source: '' };
  if (meta.origin === 'manual') {
    return { confidence: null, isNew: meta.isNew, source: 'entered by doctor' };
  }
  return {
    confidence: meta.confidence,
    isNew: meta.isNew,
    source: meta.sourceAt ? `from patient, ${formatTimeHHMM(meta.sourceAt)}` : 'from conversation',
  };
}

function buildEhrFields(
  summary: ConsultationSummary | null,
  latestVital: Vital | null,
): EhrField[] {
  const fields: EhrField[] = [];
  if (summary) {
    const provenance = summary.provenance ?? {};
    const push = (key: string, value: string) => {
      if (!value.trim()) return;
      const label = fieldKeyLabel(key);
      fields.push({
        key,
        label: label.charAt(0).toUpperCase() + label.slice(1),
        value,
        ...metaToDisplay(provenance[key]),
      });
    };
    push('chiefComplaint', summary.chiefComplaint);
    summary.symptoms.forEach((symptom, index) => push(`symptoms.${index}`, formatSymptom(symptom)));
    push('history', summary.history);
    summary.medications.forEach((item, index) => push(`medications.${index}`, item));
    summary.allergies.forEach((item, index) => push(`allergies.${index}`, item));
    summary.redFlags.forEach((item, index) => push(`redFlags.${index}`, item));
    push('additionalNotes', summary.additionalNotes);
  }
  if (latestVital) {
    const value = formatVitalLine(latestVital);
    if (value) {
      fields.push({
        key: 'vitals',
        label: 'Vitals',
        value,
        confidence: null,
        isNew: false,
        source: `entered by ${latestVital.takenBy}, ${formatTimeHHMM(latestVital.takenAt)}`,
      });
    }
  }
  return fields;
}
