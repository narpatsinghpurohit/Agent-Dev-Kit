import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { generateText } from 'ai';
import { Types } from 'mongoose';
import { z } from 'zod';
import {
  QuickAsksResponseSchema,
  TreatmentCategorySchema,
  type AiFeatureName,
  type AnswerResponse,
  type AskResponse,
  type Consultation as ConsultationDto,
  type ConsultationCreateInput,
  type ConsultationListQuery,
  type ConsultationListResponse,
  type ConsultationTurn as ConsultationTurnDto,
  type QuickAsksResponse,
  type Recommendation,
  type RecommendationUpdateInput,
  type SummaryUpdateInput,
  type TreatmentPlan,
  type VitalTrend,
} from '@repo/schemas';
import { ModelRegistryService } from '../ai/model-registry.service';
import {
  CLINICAL_INSIGHT_PROMPT_VERSION,
  clinicalInsightInstructions,
} from '../ai/prompts/clinical-insight.prompt';
import {
  CONSULTATION_EXTRACT_PROMPT_VERSION,
  consultationExtractInstructions,
} from '../ai/prompts/consultation-extract.prompt';
import { QUICK_ASKS_PROMPT_VERSION, quickAsksInstructions } from '../ai/prompts/quick-asks.prompt';
import {
  TREATMENT_PLAN_PROMPT_VERSION,
  treatmentPlanInstructions,
} from '../ai/prompts/treatment-plan.prompt';
import { AiUsageService } from '../ai/usage/ai-usage.service';
import { VoiceService } from '../ai/voice/voice.service';
import { PatientsService } from '../patients/patients.service';
import { VitalsService } from '../vitals/vitals.service';
import { type CohortStats, CohortStatsService, formatCohortLine } from './cohort-stats.service';
import type { ConsultationTurn } from './consultation.schema';
import { ConsultationsRepository, type LeanConsultation } from './consultations.repository';
import {
  ExtractionEnvelopeSchema,
  mapExtraction,
  naiveSummaryDraft,
  numberedTranscript,
  plainTranscript,
  rewriteManualProvenance,
  type SummaryDraft,
} from './summary-extraction';

/** How many recent turns the insight prompt sees (context stays cheap). */
const INSIGHT_TRANSCRIPT_TURNS = 12;

/** What the plan model must return; ids/state are assigned server-side. */
const TreatmentPlanModelOutputSchema = z.object({
  rationale: z.string().min(1),
  recommendations: z
    .array(
      z.object({
        category: TreatmentCategorySchema,
        body: z.string().min(1),
        confidence: z.number().min(0).max(1),
        evidence: z.string(),
      }),
    )
    .min(3)
    .max(6),
});

const InsightModelOutputSchema = z.object({ insight: z.string().min(1).max(500) });

/**
 * The assisted interview: the doctor asks in their language, the patient
 * hears and answers in theirs, and every utterance is stored in BOTH
 * languages. Finishing a consultation drafts the structured summary from
 * the doctor-language transcript; the doctor can correct it afterwards.
 * Vedita then drafts the treatment plan, whispers private insights, and
 * suggests follow-up questions — all through the model registry, all with
 * deterministic keyless fallbacks.
 */
@Injectable()
export class ConsultationsService {
  private readonly logger = new Logger(ConsultationsService.name);

  constructor(
    private readonly consultationsRepository: ConsultationsRepository,
    private readonly patientsService: PatientsService,
    private readonly vitalsService: VitalsService,
    private readonly cohortStatsService: CohortStatsService,
    private readonly voiceService: VoiceService,
    private readonly models: ModelRegistryService,
    private readonly usageService: AiUsageService,
  ) {}

  async create(ownerId: string, input: ConsultationCreateInput): Promise<ConsultationDto> {
    // Also the ownership check — a foreign patientId 404s here.
    const patient = await this.patientsService.get(ownerId, input.patientId);
    const consultation = await this.consultationsRepository.create(new Types.ObjectId(ownerId), {
      patientId: new Types.ObjectId(input.patientId),
      doctorLanguage: input.doctorLanguage,
      patientLanguage: patient.language,
    });
    return toDto(consultation);
  }

  /**
   * Private (vedita) turns are served as-is: consultations are single-owner
   * (every query filters ownerId), so the owner-scoped read IS the privacy
   * boundary — nobody else can fetch this record at all.
   */
  async get(ownerId: string, id: string): Promise<ConsultationDto> {
    const consultation = await this.consultationsRepository.findByIdForOwner(
      new Types.ObjectId(ownerId),
      id,
    );
    if (!consultation) throw new NotFoundException('Consultation not found');
    return toDto(consultation);
  }

  async list(ownerId: string, query: ConsultationListQuery): Promise<ConsultationListResponse> {
    const { items, hasMore } = await this.consultationsRepository.findPageByOwner(
      new Types.ObjectId(ownerId),
      query,
    );
    return {
      items: items.map(toDto),
      nextCursor: hasMore && items.length > 0 ? items[items.length - 1]!._id.toString() : null,
    };
  }

  /** Doctor asks: translate into the patient's language and speak it. */
  async ask(ownerId: string, id: string, text: string): Promise<AskResponse> {
    const consultation = await this.requireInProgress(ownerId, id);

    const translated = clampTranslation(
      await this.voiceService.translate(ownerId, {
        text,
        source: consultation.doctorLanguage,
        target: consultation.patientLanguage,
      }),
    );
    // The spoken audio is best-effort: a TTS hiccup must not lose the turn —
    // the patient can still read the translated text on screen.
    let audioBase64: string | null = null;
    try {
      const wav = await this.voiceService.speak(ownerId, {
        text: translated,
        language: consultation.patientLanguage,
      });
      audioBase64 = wav.toString('base64');
    } catch (error) {
      this.logger.warn(`ask TTS failed (turn kept): ${String(error)}`);
    }

    const { turn } = await this.appendTurn(ownerId, id, {
      speaker: 'doctor',
      kind: 'utterance',
      isPrivate: false,
      sourceLanguage: consultation.doctorLanguage,
      targetLanguage: consultation.patientLanguage,
      sourceText: text,
      translatedText: translated,
      capturedFields: [],
    });
    return { turn, audioBase64 };
  }

  /** Patient answers by microphone: transcribe, then translate back. */
  async answerAudio(
    ownerId: string,
    id: string,
    file: { buffer: Buffer; mimetype: string },
  ): Promise<AnswerResponse> {
    const consultation = await this.requireInProgress(ownerId, id);
    const transcript = await this.voiceService.hear(ownerId, {
      audio: file.buffer,
      mimeType: file.mimetype.split(';')[0] ?? 'audio/webm',
      language: consultation.patientLanguage,
    });
    return this.recordAnswer(ownerId, id, consultation, transcript);
  }

  /** Typed fallback when the microphone is unavailable. */
  async answerText(ownerId: string, id: string, text: string): Promise<AnswerResponse> {
    const consultation = await this.requireInProgress(ownerId, id);
    return this.recordAnswer(ownerId, id, consultation, text);
  }

  /** Finish: draft the structured summary from the doctor-language transcript. */
  async finish(ownerId: string, id: string): Promise<ConsultationDto> {
    const consultation = await this.requireInProgress(ownerId, id);
    if (consultation.turns.length === 0) {
      throw new BadRequestException('Nothing to summarize — the consultation has no turns');
    }
    const draft = await this.extractSummary(ownerId, consultation);
    const completed = await this.consultationsRepository.completeForOwner(
      new Types.ObjectId(ownerId),
      id,
      draft.summary,
      draft.captures,
    );
    if (!completed) {
      // A concurrent finish won the race — same 400 as the sequential path.
      const current = await this.consultationsRepository.findByIdForOwner(
        new Types.ObjectId(ownerId),
        id,
      );
      if (current) throw new BadRequestException('This consultation is already completed');
      throw new NotFoundException('Consultation not found');
    }
    return toDto(completed);
  }

  /**
   * The doctor's corrections always win over the AI draft. Any provenance
   * the client sends is IGNORED — the server rewrites it: changed fields
   * become manual (confidence 1), unchanged fields keep their AI metadata.
   */
  async updateSummary(
    ownerId: string,
    id: string,
    summary: SummaryUpdateInput,
  ): Promise<ConsultationDto> {
    const current = await this.consultationsRepository.findByIdForOwner(
      new Types.ObjectId(ownerId),
      id,
    );
    if (!current) throw new NotFoundException('Consultation not found');
    const rewritten = rewriteManualProvenance(summary, current.summary ?? null);
    const updated = await this.consultationsRepository.updateSummaryForOwner(
      new Types.ObjectId(ownerId),
      id,
      rewritten,
    );
    if (!updated) throw new NotFoundException('Consultation not found');
    return toDto(updated);
  }

  /**
   * Draft (or re-draft) the treatment plan for a COMPLETED consultation.
   * Regeneration is a full overwrite — earlier accept/modify verdicts are
   * discarded with the old items (documented simplification).
   */
  async generateTreatmentPlan(ownerId: string, id: string): Promise<ConsultationDto> {
    const consultation = await this.requireCompleted(ownerId, id);
    const patientId = consultation.patientId.toString();

    const [clinical, vitals, cohort] = await Promise.all([
      this.patientsService.getClinical(ownerId, patientId),
      this.vitalsService.list(ownerId, patientId),
      this.cohortStatsService.statsForPatient(new Types.ObjectId(ownerId), consultation.patientId),
    ]);
    const cohortLine = formatCohortLine(cohort);

    let plan: TreatmentPlan | null = null;
    const config = this.models.featureConfig('treatment-plan');
    if (!config.model.startsWith('mock:')) {
      // Provenance is EHR-pane metadata — the plan model doesn't need it.
      const summaryFields = { ...consultation.summary };
      delete summaryFields.provenance;
      const context = [
        `PATIENT PROFILE: ${JSON.stringify(clinical)}`,
        `VITALS TRENDS: ${formatTrends(vitals.trends)}`,
        `LATEST VITALS: ${JSON.stringify(vitals.items[0] ?? null)}`,
        `CONSULTATION SUMMARY: ${JSON.stringify(summaryFields)}`,
        cohortLine,
      ].join('\n');
      const raw = await this.generateJson({
        ownerId,
        feature: 'treatment-plan',
        promptVersion: TREATMENT_PLAN_PROMPT_VERSION,
        instructions: treatmentPlanInstructions(),
        content: context,
      });
      const parsed = TreatmentPlanModelOutputSchema.safeParse(raw);
      if (parsed.success) plan = buildPlan(parsed.data, cohort);
      if (!plan) {
        this.logger.warn('treatment-plan output was invalid — using the deterministic fallback');
      }
    }
    plan ??= fallbackTreatmentPlan(cohort, cohortLine);

    const updated = await this.consultationsRepository.setTreatmentPlanForOwner(
      new Types.ObjectId(ownerId),
      id,
      plan,
    );
    if (!updated) throw new NotFoundException('Consultation not found');
    return toDto(updated);
  }

  /** Symmetric GET — 404 until a plan has been generated. */
  async getTreatmentPlan(ownerId: string, id: string): Promise<TreatmentPlan> {
    const consultation = await this.consultationsRepository.findByIdForOwner(
      new Types.ObjectId(ownerId),
      id,
    );
    if (!consultation) throw new NotFoundException('Consultation not found');
    if (!consultation.treatmentPlan) throw new NotFoundException('No treatment plan generated yet');
    return consultation.treatmentPlan;
  }

  /** Doctor's verdict on one recommendation (accept / modify / reject). */
  async updateRecommendation(
    ownerId: string,
    id: string,
    recId: string,
    input: RecommendationUpdateInput,
  ): Promise<ConsultationDto> {
    const updated = await this.consultationsRepository.updateRecommendationForOwner(
      new Types.ObjectId(ownerId),
      id,
      recId,
      input,
    );
    if (!updated) throw new NotFoundException('Recommendation not found');
    return toDto(updated);
  }

  /** Suggested next questions in the doctor's language — never persisted. */
  async quickAsks(ownerId: string, id: string): Promise<QuickAsksResponse> {
    const consultation = await this.requireInProgress(ownerId, id, { forAppend: false });
    const config = this.models.featureConfig('quick-asks');
    if (!config.model.startsWith('mock:')) {
      const raw = await this.generateJson({
        ownerId,
        feature: 'quick-asks',
        promptVersion: QUICK_ASKS_PROMPT_VERSION,
        instructions: quickAsksInstructions(),
        content: plainTranscript(consultation.turns) || '(no turns yet)',
      });
      const parsed = QuickAsksResponseSchema.safeParse(raw);
      if (parsed.success) return parsed.data;
      this.logger.warn('quick-asks output was invalid — using the deterministic fallback');
    }
    return { questions: QUICK_ASKS_FALLBACK };
  }

  /**
   * One private Vedita observation, appended to the transcript as an
   * insight turn (doctor-only; never spoken or shown to the patient).
   */
  async insight(ownerId: string, id: string): Promise<ConsultationDto> {
    // Appends a turn — the in_progress guard AND the 200-turn cap apply.
    const consultation = await this.requireInProgress(ownerId, id);
    const patientId = consultation.patientId.toString();
    const [vitals, cohort] = await Promise.all([
      this.vitalsService.list(ownerId, patientId),
      this.cohortStatsService.statsForPatient(new Types.ObjectId(ownerId), consultation.patientId),
    ]);
    const cohortLine = formatCohortLine(cohort);

    let insight: string | null = null;
    const config = this.models.featureConfig('clinical-insight');
    if (!config.model.startsWith('mock:')) {
      const context = [
        `RECENT TRANSCRIPT:\n${plainTranscript(consultation.turns.slice(-INSIGHT_TRANSCRIPT_TURNS))}`,
        `VITALS TRENDS: ${formatTrends(vitals.trends)}`,
        cohortLine,
      ].join('\n');
      const raw = await this.generateJson({
        ownerId,
        feature: 'clinical-insight',
        promptVersion: CLINICAL_INSIGHT_PROMPT_VERSION,
        instructions: clinicalInsightInstructions(),
        content: context,
      });
      const parsed = InsightModelOutputSchema.safeParse(raw);
      if (parsed.success) insight = parsed.data.insight;
      else
        this.logger.warn('clinical-insight output was invalid — using the deterministic fallback');
    }
    insight ??= fallbackInsight(vitals.trends, cohortLine);

    const { updated } = await this.appendTurn(ownerId, id, {
      speaker: 'vedita',
      kind: 'insight',
      isPrivate: true,
      // Vedita speaks to the doctor: source = target = doctor language,
      // translatedText mirrors sourceText.
      sourceLanguage: consultation.doctorLanguage,
      targetLanguage: consultation.doctorLanguage,
      sourceText: insight,
      translatedText: insight,
      capturedFields: [],
    });
    return toDto(updated);
  }

  /**
   * "Sign to AHMIS" — a local status flip in this demo (never an external
   * call). Idempotent: re-signing keeps the original ahmisSyncedAt.
   */
  async ahmisSign(ownerId: string, id: string): Promise<ConsultationDto> {
    const consultation = await this.consultationsRepository.findByIdForOwner(
      new Types.ObjectId(ownerId),
      id,
    );
    if (!consultation) throw new NotFoundException('Consultation not found');
    if (consultation.status !== 'completed' || !consultation.summary) {
      throw new BadRequestException('Finish the consultation before signing to AHMIS');
    }
    if (consultation.ahmisStatus === 'synced') return toDto(consultation);
    const updated = await this.consultationsRepository.signAhmisForOwner(
      new Types.ObjectId(ownerId),
      id,
    );
    if (updated) return toDto(updated);
    // Lost a race with a concurrent sign — the record is synced; serve it.
    const current = await this.consultationsRepository.findByIdForOwner(
      new Types.ObjectId(ownerId),
      id,
    );
    if (current) return toDto(current);
    throw new NotFoundException('Consultation not found');
  }

  private async recordAnswer(
    ownerId: string,
    id: string,
    consultation: LeanConsultation,
    transcript: string,
  ): Promise<AnswerResponse> {
    // STT output is unbounded — clamp to the turn schema so the stored
    // record always satisfies the wire shape (an oversized turn would 500
    // every future read of this consultation).
    const sourceText = transcript.slice(0, 2000);
    const translated = clampTranslation(
      await this.voiceService.translate(ownerId, {
        text: sourceText,
        source: consultation.patientLanguage,
        target: consultation.doctorLanguage,
      }),
    );
    const { turn } = await this.appendTurn(ownerId, id, {
      speaker: 'patient',
      kind: 'utterance',
      isPrivate: false,
      sourceLanguage: consultation.patientLanguage,
      targetLanguage: consultation.doctorLanguage,
      sourceText,
      translatedText: translated,
      capturedFields: [],
    });
    return { turn };
  }

  private async appendTurn(
    ownerId: string,
    id: string,
    data: Omit<ConsultationTurn, 'id' | 'at'>,
  ): Promise<{ turn: ConsultationTurnDto; updated: LeanConsultation }> {
    const turn: ConsultationTurn = { ...data, id: `turn_${randomUUID()}`, at: new Date() };
    const updated = await this.consultationsRepository.appendTurnForOwner(
      new Types.ObjectId(ownerId),
      id,
      turn,
    );
    if (!updated) {
      // Distinguish "finished under us" (race with finish → 400, matching
      // the sequential path) from genuinely gone (→ 404).
      const current = await this.consultationsRepository.findByIdForOwner(
        new Types.ObjectId(ownerId),
        id,
      );
      if (current) throw new BadRequestException('This consultation is already completed');
      throw new NotFoundException('Consultation not found');
    }
    return { turn: { ...turn, at: turn.at.toISOString() }, updated };
  }

  private async requireInProgress(
    ownerId: string,
    id: string,
    options: { forAppend?: boolean } = {},
  ): Promise<LeanConsultation> {
    const consultation = await this.consultationsRepository.findByIdForOwner(
      new Types.ObjectId(ownerId),
      id,
    );
    if (!consultation) throw new NotFoundException('Consultation not found');
    if (consultation.status !== 'in_progress') {
      throw new BadRequestException('This consultation is already completed');
    }
    // The wire schema caps turns at 200 — enforce it at the boundary so a
    // marathon session degrades with a 400, not an unreadable record.
    // Read-only calls (quick-asks) opt out — they append nothing.
    if ((options.forAppend ?? true) && consultation.turns.length >= 200) {
      throw new BadRequestException('Turn limit reached — finish this consultation');
    }
    return consultation;
  }

  private async requireCompleted(ownerId: string, id: string): Promise<LeanConsultation> {
    const consultation = await this.consultationsRepository.findByIdForOwner(
      new Types.ObjectId(ownerId),
      id,
    );
    if (!consultation) throw new NotFoundException('Consultation not found');
    if (consultation.status !== 'completed') {
      throw new BadRequestException('Finish the consultation first');
    }
    return consultation;
  }

  /**
   * Everything the doctor reads is already in their language: doctor turns
   * verbatim, patient turns via their stored translation. The @2 prompt
   * cites numbered turns; the mapper turns those indices into provenance.
   */
  private async extractSummary(
    ownerId: string,
    consultation: LeanConsultation,
  ): Promise<SummaryDraft> {
    const config = this.models.featureConfig('consultation-extract');
    if (config.model.startsWith('mock:')) return naiveSummaryDraft(consultation.turns);

    const raw = await this.generateJson({
      ownerId,
      feature: 'consultation-extract',
      promptVersion: CONSULTATION_EXTRACT_PROMPT_VERSION,
      instructions: consultationExtractInstructions(),
      content: numberedTranscript(consultation.turns),
    });
    const parsed = ExtractionEnvelopeSchema.safeParse(raw);
    if (!parsed.success) {
      this.logger.warn('summary extraction returned invalid JSON — using the naive fallback');
      return naiveSummaryDraft(consultation.turns);
    }
    // First extraction: no previous summary, so every field is isNew.
    return mapExtraction(parsed.data, consultation.turns, consultation.summary ?? null);
  }

  /**
   * One budgeted generation: reserve → generateText via the registry →
   * settle with actuals (or a null refund on error). Content rides in
   * `messages`, never in instructions. Returns the candidate JSON, or null
   * on failure — callers safeParse and fall back deterministically.
   */
  private async generateJson(options: {
    ownerId: string;
    feature: AiFeatureName;
    promptVersion: string;
    instructions: string;
    content: string;
  }): Promise<unknown> {
    const config = this.models.featureConfig(options.feature);
    const reservation = await this.usageService.reserve(
      options.ownerId,
      Math.ceil(options.content.length / 4) + config.maxOutputTokens,
    );
    const startedAt = Date.now();
    try {
      const result = await generateText({
        model: this.models.languageModel(options.feature),
        instructions: options.instructions,
        messages: [{ role: 'user', content: options.content }],
      });
      await reservation.settle(AiUsageService.toTotals(result.totalUsage), {
        feature: options.feature,
        model: config.model,
        latencyMs: Date.now() - startedAt,
        promptVersion: options.promptVersion,
      });
      return extractJson(result.text);
    } catch (error) {
      await reservation.settle(null, {
        feature: options.feature,
        model: config.model,
        promptVersion: options.promptVersion,
      });
      this.logger.error(`${options.feature} generation failed: ${String(error)}`);
      return null;
    }
  }
}

/**
 * Sarvam translation output is unbounded (Indic scripts can expand well past
 * the input length) — clamp to the turn schema's translatedText cap so the
 * stored record always satisfies the wire shape.
 */
function clampTranslation(text: string): string {
  return text.slice(0, 4000);
}

/** Model output → candidate JSON (strips markdown fences some models add). */
function extractJson(text: string): unknown {
  const cleaned = text.replace(/^```(?:json)?\s*/m, '').replace(/```\s*$/m, '');
  try {
    return JSON.parse(cleaned.trim());
  } catch {
    return null;
  }
}

function formatTrends(trends: VitalTrend[]): string {
  return trends.map((trend) => `${trend.metric}: ${trend.label}`).join('; ') || 'none recorded';
}

/** Deterministic keyless questions (doctor language is English in mock mode). */
const QUICK_ASKS_FALLBACK: string[] = [
  'How many days have you had these symptoms?',
  'Are you taking any medicines at the moment?',
  'Do you have any known allergies?',
];

/** Deterministic keyless insight — cites only real trend/cohort data. */
function fallbackInsight(trends: VitalTrend[], cohortLine: string): string {
  const bp = trends.find((trend) => trend.metric === 'bp');
  const trendNote = bp ? `BP trend: ${bp.label}.` : 'No BP trend on record.';
  return `${trendNote} ${cohortLine}. Correlate the reported symptoms with the current regimen before adding medication. (mock insight — configure an AI provider key for real observations)`;
}

/** Model recommendations → plan; null when the per-category rule is broken. */
function buildPlan(
  output: z.infer<typeof TreatmentPlanModelOutputSchema>,
  cohort: CohortStats | null,
): TreatmentPlan | null {
  const counts = { herbal: 0, ahara: 0, vihara: 0 };
  for (const rec of output.recommendations) counts[rec.category] += 1;
  // Exactly the prompt's contract: 1-2 recommendations per category.
  if (Object.values(counts).some((count) => count < 1 || count > 2)) return null;

  const sequence = { herbal: 0, ahara: 0, vihara: 0 };
  const items: Recommendation[] = output.recommendations.map((rec) => {
    sequence[rec.category] += 1;
    return {
      id: `${rec.category}-${sequence[rec.category]}`,
      category: rec.category,
      body: rec.body.slice(0, 1000),
      evidence: rec.evidence.slice(0, 300),
      confidence: rec.confidence,
      state: 'suggested',
      editedBody: null,
    };
  });
  return {
    rationale: output.rationale.slice(0, 500),
    items,
    cohortSize: cohort?.n ?? null,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Deterministic keyless plan. Evidence echoes the REAL cohort line when the
 * aggregation found one (percentages are never invented), and stays
 * qualitative otherwise.
 */
function fallbackTreatmentPlan(cohort: CohortStats | null, cohortLine: string): TreatmentPlan {
  const evidence = cohort
    ? cohortLine
    : 'Classical indication for the recorded condition profile (no cohort data).';
  const item = (category: Recommendation['category'], body: string): Recommendation => ({
    id: `${category}-1`,
    category,
    body,
    evidence,
    confidence: 0.5,
    state: 'suggested',
    editedBody: null,
  });
  return {
    rationale:
      'Drafted without an AI model — a conservative starting plan from the recorded profile; review every item before prescribing.',
    items: [
      item(
        'herbal',
        'Continue the current herbal regimen; review each dose against the recorded conditions before renewing.',
      ),
      item('ahara', 'Advise a light, warm diet; reduce salt and heavy or fried food.'),
      item('vihara', 'Daily Anulom-Vilom pranayama for 10 minutes and a 30-minute morning walk.'),
    ],
    cohortSize: cohort?.n ?? null,
    generatedAt: new Date().toISOString(),
  };
}

/** Lean doc → wire shape. ObjectIds → strings, Dates → ISO; ownerId never leaves. */
function toDto(consultation: LeanConsultation): ConsultationDto {
  return {
    id: consultation._id.toString(),
    patientId: consultation.patientId.toString(),
    status: consultation.status,
    doctorLanguage: consultation.doctorLanguage,
    patientLanguage: consultation.patientLanguage,
    turns: consultation.turns.map((turn) => ({
      id: turn.id,
      speaker: turn.speaker,
      // Defaults cover docs written before the turn subdoc gained these.
      kind: turn.kind ?? 'utterance',
      isPrivate: turn.isPrivate ?? false,
      capturedFields: turn.capturedFields ?? [],
      sourceLanguage: turn.sourceLanguage,
      targetLanguage: turn.targetLanguage,
      sourceText: turn.sourceText,
      translatedText: turn.translatedText,
      at: turn.at.toISOString(),
    })),
    summary: consultation.summary ?? null,
    ahmisStatus: consultation.ahmisStatus ?? 'not_synced',
    ahmisSyncedAt: consultation.ahmisSyncedAt?.toISOString() ?? null,
    treatmentPlan: consultation.treatmentPlan ?? null,
    createdAt: consultation.createdAt.toISOString(),
    updatedAt: consultation.updatedAt.toISOString(),
    completedAt: consultation.completedAt?.toISOString() ?? null,
  };
}
