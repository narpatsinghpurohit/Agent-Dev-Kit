import { Test } from '@nestjs/testing';
import { generateText } from 'ai';
import { Types } from 'mongoose';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConsultationSummary, FieldMeta } from '@repo/schemas';
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

describe('ConsultationsService — extraction provenance', () => {
  const ownerId = new Types.ObjectId().toString();
  const consultationId = new Types.ObjectId().toString();

  const repository = {
    findByIdForOwner: vi.fn(),
    completeForOwner: vi.fn(),
    updateSummaryForOwner: vi.fn(),
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
  });
});
