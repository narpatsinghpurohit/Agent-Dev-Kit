import { z } from 'zod';
import { isoDateTime } from './common';

/**
 * Every AI-touching feature is named here. Feature code asks the model
 * registry for one of these names — never for a provider or model id.
 */
export const AiFeatureNameSchema = z.enum([
  'copilot-chat',
  'summarize',
  'speech-stt',
  'speech-tts',
  // The consultation voice pipeline (Sarvam): patient-language speech.
  'voice-stt',
  'voice-tts',
  'voice-translate',
  // Turns a finished consultation transcript into the structured summary.
  'consultation-extract',
  // Drafts the AYUSH treatment plan from the finished summary + cohort stats.
  'treatment-plan',
  // Private mid-consultation observations for the doctor (vedita turns).
  'clinical-insight',
  // Suggests short follow-up questions in the doctor's language.
  'quick-asks',
]);
export type AiFeatureName = z.infer<typeof AiFeatureNameSchema>;

export const AiProviderSchema = z.enum(['google', 'bedrock', 'sarvam', 'mock']);
export type AiProvider = z.infer<typeof AiProviderSchema>;

/** `provider:model-id`, e.g. `google:gemini-3.5-flash` or `sarvam:bulbul:v3`. */
export const ModelRefSchema = z
  .string()
  .regex(/^(google|bedrock|sarvam|mock):.+$/, 'expected "<provider>:<model-id>"');
export type ModelRef = z.infer<typeof ModelRefSchema>;

/**
 * Central per-feature model configuration — the kit's model-management
 * standard. Each entry is env-overridable (AI_MODEL_<FEATURE>); params are
 * baked into the registry alias so feature code cannot drift from them.
 */
export const FeatureModelConfigSchema = z.object({
  model: ModelRefSchema,
  temperature: z.number().min(0).max(2).optional(),
  maxOutputTokens: z.number().int().positive(),
  topP: z.number().min(0).max(1).optional(),
  /** Speech/translate features only run on providers that support them. */
  capabilities: z.array(z.enum(['chat', 'stt', 'tts', 'translate'])).default(['chat']),
});
export type FeatureModelConfig = z.infer<typeof FeatureModelConfigSchema>;

export const FeatureModelsSchema = z.record(AiFeatureNameSchema, FeatureModelConfigSchema);
export type FeatureModels = z.infer<typeof FeatureModelsSchema>;

/** Public metadata the web app may display (never keys or params). */
export const AiModelInfoSchema = z.object({
  feature: AiFeatureNameSchema,
  model: ModelRefSchema,
});
export type AiModelInfo = z.infer<typeof AiModelInfoSchema>;

/**
 * Shallow envelope validation for the copilot chat request (the AI SDK's
 * DefaultChatTransport body). Deep UIMessage validation happens server-side
 * via the AI SDK's validateUIMessages with the tool set in scope.
 */
export const UiMessageEnvelopeSchema = z.looseObject({
  id: z.string().min(1),
  role: z.enum(['system', 'user', 'assistant']),
  parts: z.array(z.looseObject({ type: z.string() })).max(100),
});

export const ChatRequestSchema = z.object({
  id: z.string().min(1).max(128),
  messages: z.array(UiMessageEnvelopeSchema).min(1).max(200),
  trigger: z.string().optional(),
  messageId: z.string().optional(),
});
export type ChatRequest = z.infer<typeof ChatRequestSchema>;

export const ConversationSchema = z.object({
  id: z.string(),
  title: z.string(),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
});
export type Conversation = z.infer<typeof ConversationSchema>;

export const TranscribeResponseSchema = z.object({
  text: z.string(),
});
export type TranscribeResponse = z.infer<typeof TranscribeResponseSchema>;

/** TTS quality degrades on very long inputs — clamp and let clients chunk. */
export const TtsRequestSchema = z.object({
  text: z.string().min(1).max(4000),
  voice: z.string().max(50).optional(),
});
export type TtsRequest = z.infer<typeof TtsRequestSchema>;
