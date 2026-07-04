import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { generateText } from 'ai';
import { Types } from 'mongoose';
import {
  ConsultationSummarySchema,
  type AnswerResponse,
  type AskResponse,
  type Consultation as ConsultationDto,
  type ConsultationCreateInput,
  type ConsultationListQuery,
  type ConsultationListResponse,
  type ConsultationSummary,
  type ConsultationTurn as ConsultationTurnDto,
  type SummaryUpdateInput,
} from '@repo/schemas';
import { ModelRegistryService } from '../ai/model-registry.service';
import {
  CONSULTATION_EXTRACT_PROMPT_VERSION,
  consultationExtractInstructions,
} from '../ai/prompts/consultation-extract.prompt';
import { AiUsageService } from '../ai/usage/ai-usage.service';
import { VoiceService } from '../ai/voice/voice.service';
import { PatientsService } from '../patients/patients.service';
import type { ConsultationTurn } from './consultation.schema';
import { ConsultationsRepository, type LeanConsultation } from './consultations.repository';

/**
 * The assisted interview: the doctor asks in their language, the patient
 * hears and answers in theirs, and every utterance is stored in BOTH
 * languages. Finishing a consultation drafts the structured summary from
 * the doctor-language transcript; the doctor can correct it afterwards.
 */
@Injectable()
export class ConsultationsService {
  private readonly logger = new Logger(ConsultationsService.name);

  constructor(
    private readonly consultationsRepository: ConsultationsRepository,
    private readonly patientsService: PatientsService,
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

    const turn = await this.appendTurn(ownerId, id, {
      speaker: 'doctor',
      sourceLanguage: consultation.doctorLanguage,
      targetLanguage: consultation.patientLanguage,
      sourceText: text,
      translatedText: translated,
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
    const summary = await this.extractSummary(ownerId, consultation);
    const completed = await this.consultationsRepository.completeForOwner(
      new Types.ObjectId(ownerId),
      id,
      summary,
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

  /** The doctor's corrections always win over the AI draft. */
  async updateSummary(
    ownerId: string,
    id: string,
    summary: SummaryUpdateInput,
  ): Promise<ConsultationDto> {
    const updated = await this.consultationsRepository.updateSummaryForOwner(
      new Types.ObjectId(ownerId),
      id,
      summary,
    );
    if (!updated) throw new NotFoundException('Consultation not found');
    return toDto(updated);
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
    const turn = await this.appendTurn(ownerId, id, {
      speaker: 'patient',
      sourceLanguage: consultation.patientLanguage,
      targetLanguage: consultation.doctorLanguage,
      sourceText,
      translatedText: translated,
    });
    return { turn };
  }

  private async appendTurn(
    ownerId: string,
    id: string,
    data: Omit<ConsultationTurn, 'id' | 'at'>,
  ): Promise<ConsultationTurnDto> {
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
    // kind/isPrivate/capturedFields live only on the wire until the turn
    // subdoc gains them (consultations extension) — surface their defaults.
    return {
      ...turn,
      kind: 'utterance',
      isPrivate: false,
      capturedFields: [],
      at: turn.at.toISOString(),
    };
  }

  private async requireInProgress(ownerId: string, id: string): Promise<LeanConsultation> {
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
    if (consultation.turns.length >= 200) {
      throw new BadRequestException('Turn limit reached — finish this consultation');
    }
    return consultation;
  }

  /**
   * Everything the doctor reads is already in their language: doctor turns
   * verbatim, patient turns via their stored translation.
   */
  private async extractSummary(
    ownerId: string,
    consultation: LeanConsultation,
  ): Promise<ConsultationSummary> {
    const transcript = consultation.turns
      .map((turn) =>
        turn.speaker === 'doctor'
          ? `Doctor: ${turn.sourceText}`
          : `Patient: ${turn.translatedText}`,
      )
      .join('\n');

    const config = this.models.featureConfig('consultation-extract');
    if (config.model.startsWith('mock:')) return naiveSummary(consultation);

    const reservation = await this.usageService.reserve(
      ownerId,
      Math.ceil(transcript.length / 4) + config.maxOutputTokens,
    );
    const startedAt = Date.now();
    try {
      const result = await generateText({
        model: this.models.languageModel('consultation-extract'),
        instructions: consultationExtractInstructions(),
        messages: [{ role: 'user', content: transcript }],
      });
      await reservation.settle(AiUsageService.toTotals(result.totalUsage), {
        feature: 'consultation-extract',
        model: config.model,
        latencyMs: Date.now() - startedAt,
        promptVersion: CONSULTATION_EXTRACT_PROMPT_VERSION,
      });
      const parsed = ConsultationSummarySchema.safeParse(extractJson(result.text));
      if (parsed.success) return parsed.data;
      this.logger.warn(`summary extraction returned invalid JSON — using the naive fallback`);
      return naiveSummary(consultation);
    } catch (error) {
      await reservation.settle(null, {
        feature: 'consultation-extract',
        model: config.model,
        promptVersion: CONSULTATION_EXTRACT_PROMPT_VERSION,
      });
      this.logger.error(`summary extraction failed: ${String(error)}`);
      return naiveSummary(consultation);
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

/** Deterministic draft when no real model is available (or it misbehaves). */
function naiveSummary(consultation: LeanConsultation): ConsultationSummary {
  const firstAnswer = consultation.turns.find((turn) => turn.speaker === 'patient');
  return {
    chiefComplaint: firstAnswer
      ? firstAnswer.translatedText.slice(0, 500)
      : 'No patient responses recorded',
    symptoms: [],
    history: '',
    medications: [],
    allergies: [],
    redFlags: [],
    additionalNotes:
      'Drafted without an AI model — review the transcript and complete this record manually.',
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
      // Wire defaults until the turn subdoc gains these fields
      // (consultations extension).
      kind: 'utterance' as const,
      isPrivate: false,
      capturedFields: [],
      sourceLanguage: turn.sourceLanguage,
      targetLanguage: turn.targetLanguage,
      sourceText: turn.sourceText,
      translatedText: turn.translatedText,
      at: turn.at.toISOString(),
    })),
    summary: consultation.summary ?? null,
    ahmisStatus: 'not_synced' as const,
    ahmisSyncedAt: null,
    treatmentPlan: null,
    createdAt: consultation.createdAt.toISOString(),
    updatedAt: consultation.updatedAt.toISOString(),
    completedAt: consultation.completedAt?.toISOString() ?? null,
  };
}
