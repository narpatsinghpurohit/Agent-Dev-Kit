/**
 * Pure view tests — props in, DOM out. No MSW, no hook mocking: the parts
 * under test render exactly what the ViewModel hands them.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { EhrField } from './console.hook';
import { EhrPane } from './parts/ehr-pane';
import { PlanPane } from './parts/plan-pane';
import { Transcript } from './parts/transcript';

const NOW = new Date().toISOString();

const baseTurn = {
  id: 'turn-1',
  speaker: 'doctor' as const,
  kind: 'utterance' as const,
  isPrivate: false,
  sourceLanguage: 'en-IN' as const,
  targetLanguage: 'hi-IN' as const,
  sourceText: 'Any headaches?',
  translatedText: 'क्या सिरदर्द है?',
  capturedFields: [],
  at: NOW,
};

describe('Transcript', () => {
  it('renders doctor, patient (with capture chip), and private insight bubbles', () => {
    const turns = [
      baseTurn,
      {
        ...baseTurn,
        id: 'turn-2',
        speaker: 'patient' as const,
        sourceLanguage: 'hi-IN' as const,
        targetLanguage: 'en-IN' as const,
        sourceText: 'सुबह चक्कर आते हैं।',
        translatedText: 'I feel dizzy in the mornings.',
        capturedFields: ['chiefComplaint', 'symptoms.0'],
      },
      {
        ...baseTurn,
        id: 'turn-3',
        speaker: 'vedita' as const,
        kind: 'insight' as const,
        isPrivate: true,
        sourceLanguage: 'en-IN' as const,
        targetLanguage: 'en-IN' as const,
        sourceText: 'BP has risen across her last 3 visits.',
        translatedText: 'BP has risen across her last 3 visits.',
      },
    ];

    render(
      <Transcript
        turns={turns}
        patientName="Kamla Devi"
        doctorName="Dr. Rekha Sharma"
        patientLanguageName="हिन्दी"
      />,
    );

    expect(screen.getByTestId('transcript')).toBeInTheDocument();
    // Doctor bubble: original + translation under the dashed divider.
    expect(screen.getByText('Any headaches?')).toBeInTheDocument();
    expect(screen.getByText('क्या सिरदर्द है?')).toBeInTheDocument();
    // Patient bubble with the green captured-to-EHR chip (labelled keys).
    expect(screen.getByText('I feel dizzy in the mornings.')).toBeInTheDocument();
    expect(screen.getByText(/Captured to EHR — chief complaint · symptom/)).toBeInTheDocument();
    // Private insight bubble: amber tones, doctor-only meta, no translation row.
    expect(screen.getByText('insight for doctor · private')).toBeInTheDocument();
    const insightText = screen.getByText('BP has risen across her last 3 visits.');
    expect(insightText.closest('div.rounded-lg')?.className).toContain('bg-insight');
  });
});

describe('EhrPane', () => {
  const consultation = {
    id: 'c0ffee00c0ffee00c0ffee00',
    patientId: 'a1b2c3d4e5f6a1b2c3d4e5f6',
    status: 'in_progress' as const,
    doctorLanguage: 'en-IN' as const,
    patientLanguage: 'hi-IN' as const,
    turns: [],
    summary: null,
    ahmisStatus: 'not_synced' as const,
    ahmisSyncedAt: null,
    treatmentPlan: null,
    createdAt: NOW,
    updatedAt: NOW,
    completedAt: null,
  };

  const fields: EhrField[] = [
    {
      key: 'chiefComplaint',
      label: 'Chief complaint',
      value: 'Recurrent occipital headache, ~2 weeks',
      confidence: 0.96,
      isNew: false,
      source: 'from patient, 08:31',
    },
    {
      key: 'symptoms.0',
      label: 'Symptom',
      value: 'Dizziness on waking, most mornings',
      confidence: 0.91,
      isNew: true,
      source: 'from patient, 08:41',
    },
    {
      key: 'additionalNotes',
      label: 'Notes',
      value: 'High salt intake — pickle with every meal',
      confidence: 0.79,
      isNew: false,
      source: 'from patient, 08:44',
    },
    {
      key: 'vitals',
      label: 'Vitals',
      value: 'BP 152/94 · Pulse 82 · Weight 74 kg',
      confidence: null,
      isNew: false,
      source: 'entered by compounder, 08:22',
    },
  ];

  const noop = () => undefined;
  const props = {
    consultation,
    ehrFields: fields,
    capturedCount: fields.length,
    isSigning: false,
    isSavingSummary: false,
    onSignAhmis: async () => undefined,
    onSaveSummary: async () => true,
    onDismiss: noop,
  };

  it('renders field cards with confidence tones, isNew highlight, and source lines', () => {
    render(<EhrPane {...props} />);

    expect(screen.getByText('Auto-filling from conversation')).toBeInTheDocument();
    expect(screen.getByText('4 fields captured')).toBeInTheDocument();

    // Confidence tones: ≥0.85 ok, ≥0.7 warn, manual muted.
    expect(screen.getByText('0.96').className).toContain('text-ok');
    expect(screen.getByText('0.79').className).toContain('text-warn');
    expect(screen.getByText('manual').className).toContain('text-ink-dim');

    // isNew → violet border + tint + "just added" pill.
    const newCard = screen
      .getByText('Dizziness on waking, most mornings')
      .closest('div.rounded-md');
    expect(newCard?.className).toContain('bg-accent-soft');
    expect(screen.getByText('just added')).toBeInTheDocument();

    // Italic source lines.
    expect(screen.getByText('from patient, 08:41')).toBeInTheDocument();
    expect(screen.getByText('entered by compounder, 08:22')).toBeInTheDocument();
  });

  it('gates the AHMIS button on completion and flips it once signed', () => {
    const { rerender } = render(<EhrPane {...props} />);
    // In progress → disabled.
    expect(screen.getByRole('button', { name: 'Review & sign to AHMIS' })).toBeDisabled();

    // Completed with a summary → enabled.
    const summary = {
      chiefComplaint: 'Headache',
      symptoms: [],
      history: '',
      medications: [],
      allergies: [],
      redFlags: [],
      additionalNotes: '',
    };
    rerender(
      <EhrPane
        {...props}
        consultation={{
          ...consultation,
          status: 'completed' as const,
          completedAt: NOW,
          summary,
        }}
      />,
    );
    expect(screen.getByRole('button', { name: 'Review & sign to AHMIS' })).toBeEnabled();

    // Signed → the button flips to the signed state.
    rerender(
      <EhrPane
        {...props}
        consultation={{
          ...consultation,
          status: 'completed' as const,
          completedAt: NOW,
          summary,
          ahmisStatus: 'synced' as const,
          ahmisSyncedAt: NOW,
        }}
      />,
    );
    expect(screen.getByRole('button', { name: /Signed to AHMIS/ })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Review & sign to AHMIS' }),
    ).not.toBeInTheDocument();
  });
});

describe('PlanPane', () => {
  const item = (overrides: Record<string, unknown>) => ({
    id: 'herbal-1',
    category: 'herbal' as const,
    body: 'Continue Sarpagandha vati 1 BD.',
    evidence: 'Improved systolic control in 71% of similar patients',
    confidence: 0.92,
    state: 'suggested' as const,
    editedBody: null,
    ...overrides,
  });

  const planConsultation = {
    id: 'c0ffee00c0ffee00c0ffee00',
    patientId: 'a1b2c3d4e5f6a1b2c3d4e5f6',
    status: 'completed' as const,
    doctorLanguage: 'en-IN' as const,
    patientLanguage: 'hi-IN' as const,
    turns: [],
    summary: null,
    ahmisStatus: 'not_synced' as const,
    ahmisSyncedAt: null,
    treatmentPlan: {
      rationale: 'Personalised for Vata–Kapha hypertension.',
      items: [
        item({}),
        item({
          id: 'ahara-1',
          category: 'ahara' as const,
          body: 'Reduce salt.',
          state: 'modified' as const,
          editedBody: 'Salt under 5 g/day; warm khichdi evenings.',
        }),
      ],
      cohortSize: 1248,
      generatedAt: NOW,
    },
    createdAt: NOW,
    updatedAt: NOW,
    completedAt: NOW,
  };

  function renderPane(onRecommendationUpdate: (...args: unknown[]) => Promise<void>) {
    return render(
      <PlanPane
        consultation={planConsultation}
        isGeneratingPlan={false}
        isUpdatingPlan={false}
        onGeneratePlan={async () => undefined}
        onRecommendationUpdate={onRecommendationUpdate}
      />,
    );
  }

  it('modify flow: edits the body and submits (recId, "modified", edited text)', () => {
    const updates: unknown[][] = [];
    renderPane(async (...args) => {
      updates.push(args);
    });

    // Only the suggested item still offers Modify.
    fireEvent.click(screen.getByRole('button', { name: 'Modify' }));
    const textarea = screen.getByRole('textbox', { name: 'Modify Herbal recommendation' });
    fireEvent.change(textarea, { target: { value: 'Arjuna churna 3 g at night instead.  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(updates).toEqual([['herbal-1', 'modified', 'Arjuna churna 3 g at night instead.']]);
  });

  it('renders editedBody (not the original body) for modified items, with the state chip', () => {
    renderPane(async () => undefined);

    expect(screen.getByText('Salt under 5 g/day; warm khichdi evenings.')).toBeInTheDocument();
    expect(screen.queryByText('Reduce salt.')).not.toBeInTheDocument();
    expect(screen.getByText('Modified')).toBeInTheDocument();
    // The cohort rationale banner quotes the panel size.
    expect(screen.getByText('1,248 similar patients')).toBeInTheDocument();
  });
});
