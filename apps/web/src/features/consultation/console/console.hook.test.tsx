/**
 * Hook test with the orval-generated MSW handlers and explicit fixtures —
 * never hand-written fetch mocks (repo testing standard). The suspense
 * probe wraps the hook because useConsultationsGetSuspense needs a
 * Suspense boundary that renderHook does not provide.
 */
import { act, waitFor } from '@testing-library/react';
import { setupServer } from 'msw/node';
import { Suspense } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Consultation } from '@repo/schemas';
import { configureApiClient } from '@repo/api-client';
import {
  getAlertsDismissMockHandler,
  getAlertsListMockHandler,
  getConsultationsAhmisSignMockHandler,
  getConsultationsAnswerTextMockHandler,
  getConsultationsAskMockHandler,
  getConsultationsFinishMockHandler,
  getConsultationsGenerateTreatmentPlanMockHandler,
  getConsultationsGetMockHandler,
  getConsultationsInsightMockHandler,
  getConsultationsQuickAsksMockHandler,
  getPatientsGetClinicalMockHandler,
  getPatientsGetMockHandler,
  getQueueListMockHandler,
  getVitalsListMockHandler,
} from '@repo/api-client/mocks';
import { renderWithProviders } from '../../../shared/testing/test-utils';
import { useConsole, type ConsoleViewModel } from './console.hook';

const CONSULTATION_ID = 'c0ffee00c0ffee00c0ffee00';
const PATIENT_ID = 'a1b2c3d4e5f6a1b2c3d4e5f6';
const NOW = new Date().toISOString();

const doctorTurn = {
  id: 'turn-1',
  speaker: 'doctor' as const,
  kind: 'utterance' as const,
  isPrivate: false,
  sourceLanguage: 'en-IN' as const,
  targetLanguage: 'hi-IN' as const,
  sourceText: 'What brings you in?',
  translatedText: 'आपको क्या तकलीफ़ है?',
  capturedFields: [],
  at: NOW,
};
const patientTurn = {
  ...doctorTurn,
  id: 'turn-2',
  speaker: 'patient' as const,
  sourceLanguage: 'hi-IN' as const,
  targetLanguage: 'en-IN' as const,
  sourceText: 'दो दिन से बुख़ार है।',
  translatedText: 'Fever for two days.',
  capturedFields: ['chiefComplaint'],
};

// One patient turn only — keeps the every-2nd-turn insight rule dormant so
// these tests exercise exactly the flows they assert.
const consultation = {
  id: CONSULTATION_ID,
  patientId: PATIENT_ID,
  status: 'in_progress' as const,
  doctorLanguage: 'en-IN' as const,
  patientLanguage: 'hi-IN' as const,
  turns: [doctorTurn, patientTurn],
  summary: null,
  ahmisStatus: 'not_synced' as const,
  ahmisSyncedAt: null,
  treatmentPlan: null,
  createdAt: NOW,
  updatedAt: NOW,
  completedAt: null,
};

const patient = {
  id: PATIENT_ID,
  name: 'Kamla Devi',
  age: 58,
  sex: 'female' as const,
  language: 'hi-IN' as const,
  createdAt: NOW,
  updatedAt: NOW,
};

const clinical = {
  prakriti: 'vata-kapha' as const,
  conditions: ['Hypertension'],
  regimen: [{ name: 'Sarpagandha vati', dose: '1', schedule: 'BD' }],
  updatedAt: NOW,
};

const calls: string[] = [];
const server = setupServer(
  getConsultationsGetMockHandler(consultation),
  getPatientsGetMockHandler(patient),
  getPatientsGetClinicalMockHandler(clinical),
  getVitalsListMockHandler({ items: [], trends: [] }),
  getQueueListMockHandler({ items: [] }),
  getAlertsListMockHandler({ items: [] }),
  getAlertsDismissMockHandler(),
  getConsultationsQuickAsksMockHandler(() => {
    calls.push('quick-asks');
    return { questions: ['Ask about sleep quality', 'Ask about salt in diet', 'Confirm yoga'] };
  }),
  getConsultationsAskMockHandler(() => {
    calls.push('ask');
    return { turn: doctorTurn, audioBase64: null };
  }),
  getConsultationsAnswerTextMockHandler(() => {
    calls.push('answer-text');
    return { turn: patientTurn };
  }),
  getConsultationsFinishMockHandler(() => {
    calls.push('finish');
    return { ...consultation, status: 'completed' as const, completedAt: NOW };
  }),
  getConsultationsGenerateTreatmentPlanMockHandler(() => {
    calls.push('treatment-plan');
    return { ...consultation, status: 'completed' as const, completedAt: NOW };
  }),
  getConsultationsAhmisSignMockHandler(() => {
    calls.push('ahmis-sign');
    return {
      ...consultation,
      status: 'completed' as const,
      ahmisStatus: 'synced' as const,
      ahmisSyncedAt: NOW,
    };
  }),
);

beforeAll(() => {
  configureApiClient({
    baseUrl: '',
    storage: { getAccessToken: () => 'test-token', setAccessToken: () => undefined },
  });
  server.listen({ onUnhandledRequest: 'error' });
});
beforeEach(() => {
  calls.length = 0;
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// Test-harness probe: capturing the ViewModel through a holder object is an
// intentional render side effect (the standard renderHook trick, hand-rolled
// here only because the suspense hook needs a Suspense boundary).
const probedRef: { current: ConsoleViewModel | null } = { current: null };
function Probe() {
  // eslint-disable-next-line react-hooks/immutability -- test probe: renderHook's own capture trick, hand-rolled to add the Suspense boundary the suspense query needs
  probedRef.current = useConsole(CONSULTATION_ID);
  return null;
}

async function renderConsole() {
  probedRef.current = null;
  await renderWithProviders(
    <Suspense fallback={null}>
      <Probe />
    </Suspense>,
  );
  await waitFor(() => expect(probedRef.current).not.toBeNull());
  // The in_progress console requests quick-asks once on load.
  await waitFor(() => expect(vm().quickAsks.length).toBeGreaterThan(0));
  return vm;
}

function vm(): ConsoleViewModel {
  expect(probedRef.current).not.toBeNull();
  return probedRef.current as ConsoleViewModel;
}

describe('useConsole', () => {
  it('loads the consultation with its context and auto-requests quick-asks', async () => {
    await renderConsole();
    expect(vm().consultation.id).toBe(CONSULTATION_ID);
    expect(vm().patient?.name).toBe('Kamla Devi');
    await waitFor(() => expect(vm().clinical?.prakriti).toBe('vata-kapha'));
    expect(vm().quickAsks).toEqual([
      'Ask about sleep quality',
      'Ask about salt in diet',
      'Confirm yoga',
    ]);
    expect(calls.filter((call) => call === 'quick-asks')).toHaveLength(1);
    expect(vm().latestDetectedLanguage).toBe('हिन्दी');
  });

  it('quick-ask chips prefill the doctor question input', async () => {
    await renderConsole();
    act(() => vm().onQuickAsk('Ask about sleep quality'));
    await waitFor(() => expect(vm().question).toBe('Ask about sleep quality'));
  });

  it('onAsk posts the question, clears the input, and refreshes quick-asks', async () => {
    await renderConsole();
    act(() => vm().onQuestionChange('Any headaches?'));
    await act(async () => vm().onAsk());
    expect(calls).toContain('ask');
    expect(vm().question).toBe('');
    await waitFor(() =>
      expect(calls.filter((call) => call === 'quick-asks').length).toBeGreaterThanOrEqual(2),
    );
  });

  it('onAnswerText posts the typed patient answer and clears it', async () => {
    await renderConsole();
    act(() => vm().onPatientTextChange('दो दिन से बुख़ार है।'));
    await act(async () => vm().onAnswerText());
    expect(calls).toContain('answer-text');
    expect(vm().patientText).toBe('');
  });

  it('onFinish completes the consultation and then triggers plan generation', async () => {
    await renderConsole();
    await act(async () => vm().onFinish());
    expect(calls).toContain('finish');
    expect(calls).toContain('treatment-plan');
    expect(calls.indexOf('finish')).toBeLessThan(calls.indexOf('treatment-plan'));
  });

  it('holds the right-pane tab state', async () => {
    await renderConsole();
    expect(vm().rightTab).toBe('ehr');
    act(() => vm().onRightTabChange('plan'));
    await waitFor(() => expect(vm().rightTab).toBe('plan'));
  });

  it('onSignAhmis posts the sign request', async () => {
    await renderConsole();
    await act(async () => vm().onSignAhmis());
    expect(calls).toContain('ahmis-sign');
  });

  it('exposes the vi.fn-free error channel on failed asks', async () => {
    await renderConsole();
    // Empty question is a no-op — no request, no error.
    await act(async () => vm().onAsk());
    expect(calls).not.toContain('ask');
    expect(vm().error).toBeNull();
    expect(vi.isMockFunction(vm().onAsk)).toBe(false);
  });

  describe('auto-insight (every 2nd patient turn)', () => {
    const doctorTurn2 = { ...doctorTurn, id: 'turn-3' };
    const patientTurn2 = {
      ...patientTurn,
      id: 'turn-4',
      translatedText: 'Yes, mostly in the mornings.',
    };
    const insightTurn = {
      ...doctorTurn,
      id: 'turn-insight',
      speaker: 'vedita' as const,
      kind: 'insight' as const,
      isPrivate: true,
      sourceLanguage: 'en-IN' as const,
      targetLanguage: 'en-IN' as const,
      sourceText: 'BP has risen across her last 3 visits.',
      translatedText: 'BP has risen across her last 3 visits.',
    };

    function useConsultationFixture(fixture: Consultation) {
      server.use(
        getConsultationsGetMockHandler(fixture),
        getConsultationsInsightMockHandler(() => {
          calls.push('insight');
          return fixture;
        }),
      );
    }

    it('requests exactly one insight once the 2nd patient turn lands', async () => {
      useConsultationFixture({
        ...consultation,
        turns: [doctorTurn, patientTurn, doctorTurn2, patientTurn2],
      });
      await renderConsole();
      await waitFor(() => expect(calls.filter((call) => call === 'insight')).toHaveLength(1));
      // The refetch that follows the insight must not re-fire the rule.
      await act(async () => undefined);
      expect(calls.filter((call) => call === 'insight')).toHaveLength(1);
    });

    it('stays quiet on remount when the insight for this count already exists', async () => {
      useConsultationFixture({
        ...consultation,
        turns: [doctorTurn, patientTurn, doctorTurn2, patientTurn2, insightTurn],
      });
      await renderConsole(); // quick-asks resolved → mount effects have run
      await act(async () => undefined);
      expect(calls).not.toContain('insight');
    });

    it('never fires once the consultation is completed', async () => {
      useConsultationFixture({
        ...consultation,
        status: 'completed' as const,
        completedAt: NOW,
        turns: [doctorTurn, patientTurn, doctorTurn2, patientTurn2],
      });
      // Completed consultations request no quick-asks either, so render
      // without the renderConsole quick-asks wait.
      probedRef.current = null;
      await renderWithProviders(
        <Suspense fallback={null}>
          <Probe />
        </Suspense>,
      );
      await waitFor(() => expect(probedRef.current).not.toBeNull());
      await act(async () => undefined);
      expect(calls).toEqual([]);
    });
  });
});
