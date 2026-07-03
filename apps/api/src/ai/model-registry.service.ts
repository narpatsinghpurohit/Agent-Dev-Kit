import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { createGoogleGenerativeAI, type GoogleGenerativeAIProvider } from '@ai-sdk/google';
import type { ProviderV4 } from '@ai-sdk/provider';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createProviderRegistry,
  customProvider,
  defaultSettingsMiddleware,
  type LanguageModel,
  type SpeechModel,
  wrapLanguageModel,
} from 'ai';
import type { AiFeatureName, AiModelInfo, FeatureModelConfig } from '@repo/schemas';
import type { Env } from '../config/env.schema';
import {
  envOverridesFrom,
  type ResolvedFeatureModels,
  resolveFeatureModels,
} from './feature-models';
import { MockLanguageModel } from './providers/mock/mock-language-model';

/**
 * The single gateway to language models. Feature code calls
 * `models.languageModel('<feature>')` — provider construction, model ids,
 * and sampling params all live here (and in feature-models.ts).
 */
@Injectable()
export class ModelRegistryService {
  private readonly logger = new Logger(ModelRegistryService.name);
  private readonly features: ResolvedFeatureModels;
  private readonly aliases: ReturnType<typeof customProvider>;
  private readonly google?: GoogleGenerativeAIProvider;
  readonly mode: Env['AI_PROVIDER_MODE'];

  constructor(configService: ConfigService<Env, true>) {
    const get = <K extends keyof Env>(key: K) => configService.get(key, { infer: true });

    this.mode = get('AI_PROVIDER_MODE');
    const googleKey = get('GOOGLE_GENERATIVE_AI_API_KEY');
    const bedrockKey = get('AWS_BEARER_TOKEN_BEDROCK');

    this.features = resolveFeatureModels({
      mode: this.mode,
      overrides: envOverridesFrom(get),
      hasGoogleKey: Boolean(googleKey),
      hasBedrockAuth: Boolean(bedrockKey),
    });

    const mockProvider = {
      // Without this the SDK assumes a v2-era provider and adapts models
      // through a compatibility layer that garbles usage accounting.
      specificationVersion: 'v4',
      languageModel: (modelId: string) => new MockLanguageModel(modelId),
    } as unknown as ProviderV4;

    const providers: Record<string, ProviderV4> = { mock: mockProvider };
    if (googleKey) {
      this.google = createGoogleGenerativeAI({ apiKey: googleKey });
      providers.google = this.google as unknown as ProviderV4;
    }
    if (bedrockKey) {
      providers.bedrock = createAmazonBedrock({
        apiKey: bedrockKey,
        region: get('AWS_REGION'),
      }) as unknown as ProviderV4;
    }
    const registry = createProviderRegistry(providers);

    const languageModels = {} as Record<AiFeatureName, LanguageModel>;
    for (const [feature, config] of Object.entries(this.features) as Array<
      [AiFeatureName, FeatureModelConfig]
    >) {
      if (!config.capabilities.includes('chat') && !config.capabilities.includes('stt')) continue;
      languageModels[feature] = wrapLanguageModel({
        // Dynamic refs can't satisfy the registry's template-literal types.
        model: registry.languageModel(config.model as Parameters<typeof registry.languageModel>[0]),
        middleware: defaultSettingsMiddleware({
          settings: {
            temperature: config.temperature,
            maxOutputTokens: config.maxOutputTokens,
            topP: config.topP,
          },
        }),
      });
    }
    this.aliases = customProvider({ languageModels });

    this.logger.log(
      `AI provider mode: ${this.mode}. Features: ${Object.entries(this.features)
        .map(([feature, config]) => `${feature}→${config.model}`)
        .join(', ')}`,
    );
  }

  /** The only way feature code gets a model. */
  languageModel(feature: AiFeatureName): LanguageModel {
    return this.aliases.languageModel(feature);
  }

  featureConfig(feature: AiFeatureName): FeatureModelConfig {
    return this.features[feature];
  }

  /** Real TTS model, or null in mock mode (speech service returns canned audio). */
  speechModel(): SpeechModel | null {
    if (this.mode === 'mock' || !this.google) return null;
    const modelId = this.features['speech-tts'].model.split(':')[1]!;
    return this.google.speech(modelId);
  }

  /** Public metadata for the web UI — never keys or params. */
  info(): AiModelInfo[] {
    return (Object.entries(this.features) as Array<[AiFeatureName, FeatureModelConfig]>).map(
      ([feature, config]) => ({ feature, model: config.model }),
    );
  }
}
