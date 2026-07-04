import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { generateText } from 'ai';
import { Types } from 'mongoose';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConsultationSummary, FieldMeta, TreatmentPlan } from '@repo/schemas';
import { ModelRegistryService } from '../ai/model-registry.service';
import { AiUsageService } from '../ai/usage/ai-usage.service';
import { VoiceService } from '../ai/voice/voice.service';
import { PatientsService } from '../patients/patients.service';
import { VitalsService } from '../vitals/vitals.service';
import { CohortStatsService } from './cohort-stats.service';
import type { ConsultationTurn } from './consultation.schema';
import { ConsultationsRepository, type LeanConsultation } from './consultations.repository';
import { ConsultationsService } from './consultations.service';

// The model boundary: everything else in the pipeline runs for real.
vi.mock('ai', () => ({ generateText: vi.fn() }));

describe('ConsultationsService', () => {
  const ownerId = new Types.ObjectId().toString();
  const consultationId = new Types.ObjectId().toString();

  const repository = {
    findByIdForOwner: vi.fn(),
    completeForOwner: vi.fn(),
    updateSummaryForOwner: vi.fn(),
    appendTurnForOwner: vi.fn(),
    setTreatmentPlanForOwner: vi.fn(),
  };
  const patients = { get: vi.fn(), getClinical: vi.fn() };
  const vitals = { list: vi.fn() };
  const cohortStats = { statsForPatient: vi.fn() };
  const voice = { translate: vi.fn(), speak: vi.fn(), hear: vi.fn() };
  const models = {
    featureConfig: vi.fn(() => ({
      model: 'google:gemini-test',
      maxOutputTokens: 2048,
      capabilities: ['chat'],
    })),
    languageModel: vi.fn(() => ({}) as never),
  };
  const settle = vi.fn();
  const usage = { reserve: vi.fn(async () => ({ settle })) };
  let service: ConsultationsService;

  const turn = (overrides: Partial<ConsultationTurn>): ConsultationTurn => ({
    id: `turn_${Math.random().toString(36).slice(2)}`,
    speaker: 'doctor',
    kind: 'utterance',
    isPrivate: false,
    sourceLanguage: 'en-IN',
    targetLanguage: 'hi-IN',
    sourceText: 'text',
    translatedText: 'text',
    capturedFields: [],
    at: new Date('2026-07-04T09:00:00.000Z'),
    ...overrides,
  });

  const consultation = (overrides: Partial<LeanConsultation> = {}): LeanConsultation => ({
    _id: new Types.ObjectId(consultationId),
    ownerId: new Types.ObjectId(ownerId),
    patientId: new Types.ObjectId(),
    status: 'in_progress',
    doctorLanguage: 'en-IN',
    patientLanguage: 'hi-IN',
    turns: [],
    ahmisStatus: 'not_synced',
    ahmisSyncedAt: null,
    treatmentPlan: null,
    createdAt: new Date('2026-07-04T08:00:00.000Z'),
    updatedAt: new Date('2026-07-04T09:30:00.000Z'),
    ...overrides,
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        ConsultationsService,
        { provide: ConsultationsRepository, useValue: repository },
        { provide: PatientsService, useValue: patients },
        { provide: VitalsService, useValue: vitals },
        { provide: CohortStatsService, useValue: cohortStats },
        { provide: VoiceService, useValue: voice },
        { provide: ModelRegistryService, useValue: models },
        { provide: AiUsageService, useValue: usage },
      ],
    }).compile();
    service = moduleRef.get(ConsultationsService);
  });

  const doctorTurn = turn({
    id: 'turn_q1',
    speaker: 'doctor',
    sourceText: 'What brings you in?',
    at: new Date('2026-07-04T09:00:00.000Z'),
  });
  const patientTurn = turn({
    id: 'turn_a1',
    speaker: 'patient',
    sourceLanguage: 'hi-IN',
    targetLanguage: 'en-IN',
    sourceText: 'दो दिन से बुखार है।',
    translatedText: 'Fever for two days.',
    at: new Date('2026-07-04T09:01:00.000Z'),
  });

  function stubModelText(text: string) {
    vi.mocked(generateText).mockResolvedValue({
      text,
      totalUsage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
    } as never);
  }

  it('maps sourceTurnIndex to real turn ids/times, out-of-range to null, and writes capture chips', async () => {
    const inProgress = consultation({ turns: [doctorTurn, patientTurn] });
    repository.findByIdForOwner.mockResolvedValue(inProgress);
    repository.completeForOwner.mockImplementation(
      async (_owner: Types.ObjectId, _id: string, summary: ConsultationSummary) =>
        consultation({ status: 'completed', summary, completedAt: new Date() }),
    );
    stubModelText(
      JSON.stringify({
        chiefComplaint: { value: 'Fever for two days', confidence: 0.9, sourceTurnIndex: 1 },
        symptoms: [
          { value: { name: 'fever', duration: '2 days' }, confidence: 0.85, sourceTurnIndex: 1 },
        ],
        history: { value: '', confidence: 0, sourceTurnIndex: null },
        medications: [{ value: 'paracetamol', confidence: 0.95, sourceTurnIndex: 99 }],
        allergies: [],
        redFlags: [],
        additionalNotes: { value: 'Patient sounded tired', confidence: 0.4, sourceTurnIndex: 0 },
      }),
    );

    const dto = await service.finish(ownerId, consultationId);

    const [, , summary, captures] = repository.completeForOwner.mock.calls[0] as [
      Types.ObjectId,
      string,
      ConsultationSummary,
      Array<{ turnId: string; fields: string[] }>,
    ];
    // Cited index 1 → the patient turn's id + timestamp.
    expect(summary.provenance?.chiefComplaint).toEqual({
      confidence: 0.9,
      sourceTurnId: 'turn_a1',
      sourceAt: '2026-07-04T09:01:00.000Z',
      isNew: true,
      origin: 'ai',
    });
    expect(summary.provenance?.['symptoms.0']).toMatchObject({
      sourceTurnId: 'turn_a1',
      isNew: true,
    });
    // Out-of-range index → null source, provenance still recorded.
    expect(summary.provenance?.['medications.0']).toMatchObject({
      confidence: 0.95,
      sourceTurnId: null,
      sourceAt: null,
    });
    // Empty scalar → no provenance key at all.
    expect(summary.provenance?.history).toBeUndefined();
    // Capture chips grouped per cited turn.
    expect(captures).toEqual([
      { turnId: 'turn_a1', fields: ['chiefComplaint', 'symptoms.0'] },
      { turnId: 'turn_q1', fields: ['additionalNotes'] },
    ]);
    expect(dto.status).toBe('completed');

    // Budgeted call settled with actuals + the @2 prompt version.
    expect(usage.reserve).toHaveBeenCalledTimes(1);
    expect(settle).toHaveBeenCalledWith(
      { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
      expect.objectContaining({
        feature: 'consultation-extract',
        promptVersion: 'consultation-extract@2',
      }),
    );
  });

  it('falls back to the naive draft WITH provenance when the model returns junk', async () => {
    const inProgress = consultation({ turns: [doctorTurn, patientTurn] });
    repository.findByIdForOwner.mockResolvedValue(inProgress);
    repository.completeForOwner.mockImplementation(
      async (_owner: Types.ObjectId, _id: string, summary: ConsultationSummary) =>
        consultation({ status: 'completed', summary, completedAt: new Date() }),
    );
    stubModelText('this is not json at all');

    await service.finish(ownerId, consultationId);

    const [, , summary, captures] = repository.completeForOwner.mock.calls[0] as [
      Types.ObjectId,
      string,
      ConsultationSummary,
      Array<{ turnId: string; fields: string[] }>,
    ];
    expect(summary.chiefComplaint).toBe('Fever for two days.');
    // Fallback provenance: confidence 0.6, sourced from the first patient turn.
    expect(summary.provenance?.chiefComplaint).toEqual({
      confidence: 0.6,
      sourceTurnId: 'turn_a1',
      sourceAt: '2026-07-04T09:01:00.000Z',
      isNew: true,
      origin: 'ai',
    });
    expect(captures).toEqual([{ turnId: 'turn_a1', fields: ['chiefComplaint'] }]);
  });

  it('short-circuits to the fallback on the mock model without calling generateText', async () => {
    models.featureConfig.mockReturnValueOnce({
      model: 'mock:consultation-extract',
      maxOutputTokens: 2048,
      capabilities: ['chat'],
    });
    const inProgress = consultation({ turns: [patientTurn] });
    repository.findByIdForOwner.mockResolvedValue(inProgress);
    repository.completeForOwner.mockImplementation(
      async (_owner: Types.ObjectId, _id: string, summary: ConsultationSummary) =>
        consultation({ status: 'completed', summary, completedAt: new Date() }),
    );

    await service.finish(ownerId, consultationId);

    expect(generateText).not.toHaveBeenCalled();
    expect(usage.reserve).not.toHaveBeenCalled();
    const [, , summary] = repository.completeForOwner.mock.calls[0] as [
      Types.ObjectId,
      string,
      ConsultationSummary,
    ];
    expect(summary.provenance?.chiefComplaint?.origin).toBe('ai');
    expect(summary.provenance?.chiefComplaint?.confidence).toBe(0.6);
  });

  describe('updateSummary provenance rewrite', () => {
    const aiMeta: FieldMeta = {
      confidence: 0.9,
      sourceTurnId: 'turn_a1',
      sourceAt: '2026-07-04T09:01:00.000Z',
      isNew: true,
      origin: 'ai',
    };
    const stored: ConsultationSummary = {
      chiefComplaint: 'Fever for two days.',
      symptoms: [],
      history: '',
      medications: [],
      allergies: [],
      redFlags: [],
      additionalNotes: 'AI note',
      provenance: { chiefComplaint: aiMeta, additionalNotes: { ...aiMeta, sourceTurnId: null } },
    };

    it('rewrites changed fields as manual, preserves AI metadata for unchanged ones, and ignores client provenance', async () => {
      const completed = consultation({ status: 'completed', summary: stored });
      repository.findByIdForOwner.mockResolvedValue(completed);
      repository.updateSummaryForOwner.mockImplementation(
        async (_owner: Types.ObjectId, _id: string, summary: ConsultationSummary) =>
          consultation({ status: 'completed', summary }),
      );

      await service.updateSummary(ownerId, consultationId, {
        ...stored,
        chiefComplaint: 'Fever, 2 days — corrected by doctor',
        medications: ['paracetamol'],
        // The client tries to smuggle provenance — the server must drop it.
        provenance: {
          chiefComplaint: { ...aiMeta, confidence: 0.01 },
          forged: { ...aiMeta },
        },
      });

      const [, , written] = repository.updateSummaryForOwner.mock.calls[0] as [
        Types.ObjectId,
        string,
        ConsultationSummary,
      ];
      // Changed → manual, full confidence, no source turn.
      expect(written.provenance?.chiefComplaint).toEqual({
        confidence: 1,
        sourceTurnId: null,
        sourceAt: null,
        isNew: false,
        origin: 'manual',
      });
      // Unchanged → the stored AI metadata survives untouched.
      expect(written.provenance?.additionalNotes).toEqual({ ...aiMeta, sourceTurnId: null });
      // New array entry → manual; the forged client key never persists.
      expect(written.provenance?.['medications.0']?.origin).toBe('manual');
      expect(written.provenance?.forged).toBeUndefined();
    });

    it('400s (not 404) when the consultation is still in progress', async () => {
      repository.findByIdForOwner.mockResolvedValue(consultation({ status: 'in_progress' }));

      await expect(service.updateSummary(ownerId, consultationId, stored)).rejects.toThrow(
        new BadRequestException('Finish the consultation before editing the summary'),
      );
      expect(repository.updateSummaryForOwner).not.toHaveBeenCalled();
    });
  });

  describe('generateTreatmentPlan (real model)', () => {
    const rec = (category: 'herbal' | 'ahara' | 'vihara', body: string, confidence = 0.8) => ({
      category,
      body,
      confidence,
      evidence: 'Improved systolic control in 71% of similar patients',
    });

    beforeEach(() => {
      repository.findByIdForOwner.mockResolvedValue(
        consultation({ status: 'completed', completedAt: new Date() }),
      );
      repository.setTreatmentPlanForOwner.mockImplementation(
        async (_owner: Types.ObjectId, _id: string, plan: TreatmentPlan) =>
          consultation({ status: 'completed', treatmentPlan: plan }),
      );
      patients.getClinical.mockResolvedValue({
        prakriti: 'vata-kapha',
        conditions: ['Hypertension'],
        regimen: [],
        updatedAt: '2026-07-04T08:00:00.000Z',
      });
      vitals.list.mockResolvedValue({ items: [], trends: [] });
      cohortStats.statsForPatient.mockResolvedValue({ n: 12, improvedPct: 62 });
    });

    it('assigns per-category sequential ids, suggested state, and the cohort size', async () => {
      stubModelText(
        JSON.stringify({
          rationale: 'Personalised for Vata–Kapha hypertension.',
          recommendations: [
            rec('herbal', 'Continue Sarpagandha vati 1 BD.', 0.92),
            rec('ahara', 'Reduce salt to under 5 g/day.'),
            rec('herbal', 'Add Arjuna churna 3 g at night.'),
            rec('vihara', 'Anulom-Vilom pranayama 10 minutes daily.'),
          ],
        }),
      );

      const dto = await service.generateTreatmentPlan(ownerId, consultationId);

      const plan = dto.treatmentPlan!;
      expect(plan.items.map((item) => item.id)).toEqual([
        'herbal-1',
        'ahara-1',
        'herbal-2',
        'vihara-1',
      ]);
      for (const item of plan.items) {
        expect(item.state).toBe('suggested');
        expect(item.editedBody).toBeNull();
      }
      expect(plan.rationale).toBe('Personalised for Vata–Kapha hypertension.');
      expect(plan.cohortSize).toBe(12);
      expect(settle).toHaveBeenCalledWith(
        { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
        expect.objectContaining({ feature: 'treatment-plan', promptVersion: 'treatment-plan@1' }),
      );
    });

    it('falls back when the 1-2-per-category contract is broken, echoing the REAL cohort line', async () => {
      stubModelText(
        JSON.stringify({
          rationale: 'Too enthusiastic about herbs.',
          recommendations: [
            rec('herbal', 'One.'),
            rec('herbal', 'Two.'),
            rec('herbal', 'Three.'),
            rec('ahara', 'Diet.'),
            rec('vihara', 'Walk.'),
          ],
        }),
      );

      const dto = await service.generateTreatmentPlan(ownerId, consultationId);

      const plan = dto.treatmentPlan!;
      expect(plan.items.map((item) => item.id)).toEqual(['herbal-1', 'ahara-1', 'vihara-1']);
      for (const item of plan.items) {
        expect(item.state).toBe('suggested');
        // The deterministic fallback quotes the real cohort percentage —
        // never one the model invented.
        expect(item.evidence).toBe('COHORT: 62% of 12 similar patients improved systolic control');
      }
      expect(plan.cohortSize).toBe(12);
    });

    it('falls back to the deterministic plan on non-JSON model output', async () => {
      stubModelText('sorry, I cannot help with that');

      const dto = await service.generateTreatmentPlan(ownerId, consultationId);

      expect(dto.treatmentPlan!.items.map((item) => item.id)).toEqual([
        'herbal-1',
        'ahara-1',
        'vihara-1',
      ]);
    });
  });

  describe('quick-asks / insight (real model fallbacks)', () => {
    beforeEach(() => {
      vitals.list.mockResolvedValue({ items: [], trends: [] });
      cohortStats.statsForPatient.mockResolvedValue(null);
    });

    it('quickAsks falls back to the deterministic questions on invalid model JSON', async () => {
      repository.findByIdForOwner.mockResolvedValue(consultation({ turns: [doctorTurn] }));
      stubModelText(JSON.stringify({ questions: [] })); // violates min(1)

      const res = await service.quickAsks(ownerId, consultationId);

      expect(res.questions).toHaveLength(3);
      expect(res.questions[0]).toContain('How many days');
    });

    it('insight appends the deterministic fallback turn on invalid model JSON', async () => {
      repository.findByIdForOwner.mockResolvedValue(consultation({ turns: [doctorTurn] }));
      repository.appendTurnForOwner.mockImplementation(
        async (_owner: Types.ObjectId, _id: string, appended: ConsultationTurn) =>
          consultation({ turns: [doctorTurn, appended] }),
      );
      stubModelText(JSON.stringify({ insight: '' })); // violates min(1)

      const dto = await service.insight(ownerId, consultationId);

      const appended = dto.turns.at(-1)!;
      expect(appended).toMatchObject({ speaker: 'vedita', kind: 'insight', isPrivate: true });
      expect(appended.sourceText).toContain('mock insight');
      expect(appended.sourceText).toContain('COHORT: insufficient data');
    });

    it('refunds the reservation (settle(null)) and still falls back when generation throws', async () => {
      repository.findByIdForOwner.mockResolvedValue(consultation({ turns: [doctorTurn] }));
      vi.mocked(generateText).mockRejectedValue(new Error('provider down'));

      const res = await service.quickAsks(ownerId, consultationId);

      expect(res.questions).toHaveLength(3);
      expect(settle).toHaveBeenCalledTimes(1);
      expect(settle).toHaveBeenCalledWith(
        null,
        expect.objectContaining({ feature: 'quick-asks', model: 'google:gemini-test' }),
      );
    });
  });

  describe('the 200-turn cap', () => {
    const capped = () =>
      consultation({
        turns: Array.from({ length: 200 }, (_, i) => turn({ id: `turn_${i}` })),
      });

    it('blocks insight — it would append the 201st turn', async () => {
      repository.findByIdForOwner.mockResolvedValue(capped());

      await expect(service.insight(ownerId, consultationId)).rejects.toThrow(
        new BadRequestException('Turn limit reached — finish this consultation'),
      );
      expect(repository.appendTurnForOwner).not.toHaveBeenCalled();
    });

    it('lets quickAsks through — it appends nothing', async () => {
      models.featureConfig.mockReturnValueOnce({
        model: 'mock:quick-asks',
        maxOutputTokens: 512,
        capabilities: ['chat'],
      });
      repository.findByIdForOwner.mockResolvedValue(capped());

      const res = await service.quickAsks(ownerId, consultationId);

      expect(res.questions).toHaveLength(3);
    });

    it('lets finish through — the cap must never deadlock completion', async () => {
      models.featureConfig.mockReturnValueOnce({
        model: 'mock:consultation-extract',
        maxOutputTokens: 2048,
        capabilities: ['chat'],
      });
      repository.findByIdForOwner.mockResolvedValue(capped());
      repository.completeForOwner.mockImplementation(
        async (_owner: Types.ObjectId, _id: string, summary: ConsultationSummary) =>
          consultation({ status: 'completed', summary, completedAt: new Date() }),
      );

      const dto = await service.finish(ownerId, consultationId);

      expect(dto.status).toBe('completed');
    });
  });
});
