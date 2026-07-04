import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { createGoogleGenerativeAI, type GoogleGenerativeAIProvider } from '@ai-sdk/google';
import type { ProviderV4 } from '@ai-sdk/provider';
import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createProviderRegistry,
  customProvider,
  defaultSettingsMiddleware,
  type LanguageModel,
  type SpeechModel,
  wrapLanguageModel,
} from 'ai';
import type { AiFeatureName, AiModelInfo, AiSettings, FeatureModelConfig } from '@repo/schemas';
import type { Env } from '../config/env.schema';
import { SettingsService } from '../settings/settings.service';
import {
  envOverridesFrom,
  resolveFeatureModels,
  type ResolvedFeatureModels,
} from './feature-models';
import { MockLanguageModel } from './providers/mock/mock-language-model';

/**
 * The single gateway to language models, driven by runtime settings.
 * Feature code calls `models.languageModel('<feature>')` — provider
 * construction, model ids, and sampling params all live here. The registry
 * REBUILDS whenever settings change (admin edits keys/model/params), so no
 * restart is needed; if a rebuild fails, the previous registry keeps serving.
 */
@Injectable()
export class ModelRegistryService implements OnModuleInit {
  private readonly logger = new Logger(ModelRegistryService.name);
  private features!: ResolvedFeatureModels;
  private aliases!: ReturnType<typeof customProvider>;
  private google: GoogleGenerativeAIProvider | null = null;

  constructor(
    private readonly configService: ConfigService<Env, true>,
    private readonly settingsService: SettingsService,
  ) {
    this.rebuild();
  }

  onModuleInit(): void {
    this.settingsService.onChange(() => this.rebuild());
    // SettingsService loaded the DB values during ITS init, before we were
    // subscribed — rebuild once so boot never serves stale env seeds.
    this.rebuild();
  }

  get mode(): AiSettings['providerMode'] {
    return this.settingsService.getAi().providerMode;
  }

  /** The only way feature code gets a model. */
  languageModel(feature: AiFeatureName): LanguageModel {
    return this.aliases.languageModel(feature);
  }

  featureConfig(feature: AiFeatureName): FeatureModelConfig {
    return this.features[feature];
  }

  /** Real TTS model, or null when TTS runs on the mock (canned silence). */
  speechModel(): SpeechModel | null {
    const modelRef = this.features['speech-tts'].model;
    const [provider, modelId] = modelRef.split(':') as [string, string];
    if (provider !== 'google' || !this.google) return null;
    return this.google.speech(modelId);
  }

  /** Public metadata for the web UI — never keys or params. */
  info(): AiModelInfo[] {
    return (Object.entries(this.features) as Array<[AiFeatureName, FeatureModelConfig]>).map(
      ([feature, config]) => ({ feature, model: config.model }),
    );
  }

  private rebuild(): void {
    try {
      const ai = this.settingsService.getAi();
      const secrets = {
        google: this.settingsService.getSecret('googleApiKey'),
        bedrock: this.settingsService.getSecret('bedrockApiKey'),
        sarvam: this.settingsService.getSecret('sarvamApiKey'),
      };

      const get = <K extends keyof Env>(key: K) => this.configService.get(key, { infer: true });
      let features = resolveFeatureModels({
        mode: ai.providerMode,
        overrides: envOverridesFrom(get),
        copilot: ai.copilot,
      });

      // Graceful degradation: a feature whose provider has no key falls back
      // to the mock model instead of breaking the whole app at call time.
      const available = new Set(['mock']);
      if (ai.providerMode === 'auto') {
        if (secrets.google) available.add('google');
        if (secrets.bedrock) available.add('bedrock');
        if (secrets.sarvam) available.add('sarvam');
      }
      features = Object.fromEntries(
        (Object.entries(features) as Array<[AiFeatureName, FeatureModelConfig]>).map(
          ([feature, config]) => {
            const provider = config.model.split(':')[0]!;
            if (available.has(provider)) return [feature, config];
            this.logger.warn(
              `feature "${feature}" wants ${config.model} but the ${provider} key is not set — serving the mock model`,
            );
            return [feature, { ...config, model: `mock:${feature}` }];
          },
        ),
      ) as ResolvedFeatureModels;

      const mockProvider = {
        // Without this the SDK assumes a v2-era provider and adapts models
        // through a compatibility layer that garbles usage accounting.
        specificationVersion: 'v4',
        languageModel: (modelId: string) => new MockLanguageModel(modelId),
      } as unknown as ProviderV4;

      const providers: Record<string, ProviderV4> = { mock: mockProvider };
      // Build into locals; assign to fields only on success so a failed
      // rebuild cannot half-degrade the previous (still serving) registry.
      let google: GoogleGenerativeAIProvider | null = null;
      if (available.has('google') && secrets.google) {
        google = createGoogleGenerativeAI({ apiKey: secrets.google });
        providers.google = google as unknown as ProviderV4;
      }
      if (available.has('bedrock') && secrets.bedrock) {
        providers.bedrock = createAmazonBedrock({
          apiKey: secrets.bedrock,
          region: ai.awsRegion,
        }) as unknown as ProviderV4;
      }
      const registry = createProviderRegistry(providers);

      const languageModels = {} as Record<AiFeatureName, LanguageModel>;
      for (const [feature, config] of Object.entries(features) as Array<
        [AiFeatureName, FeatureModelConfig]
      >) {
        if (!config.capabilities.includes('chat') && !config.capabilities.includes('stt')) continue;
        // Sarvam is REST-only (src/ai/sarvam/) — it has no AI SDK model to alias.
        if (config.model.startsWith('sarvam:')) continue;
        languageModels[feature] = wrapLanguageModel({
          // Dynamic refs can't satisfy the registry's template-literal types.
          model: registry.languageModel(
            config.model as Parameters<typeof registry.languageModel>[0],
          ),
          middleware: defaultSettingsMiddleware({
            settings: {
              temperature: config.temperature,
              maxOutputTokens: config.maxOutputTokens,
              topP: config.topP,
            },
          }),
        });
      }

      this.features = features;
      this.aliases = customProvider({ languageModels });
      this.google = google;
      this.logger.log(
        `model registry ready (${ai.providerMode}): ${Object.entries(features)
          .map(([feature, config]) => `${feature}→${config.model}`)
          .join(', ')}`,
      );
    } catch (error) {
      // Keep serving the previous registry rather than taking the app down.
      this.logger.error(`model registry rebuild failed: ${String(error)}`);
      if (!this.aliases) throw error; // first build (boot) must still fail fast
    }
  }
}
