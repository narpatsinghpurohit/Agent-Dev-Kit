import {
  BadRequestException,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { z } from 'zod';
import {
  AiSettingsSchema,
  GeneralSettingsSchema,
  type AiSettings,
  type GeneralSettings,
  type SecretNameType,
  type SettingsResponse,
  type SettingsUpdate,
} from '@repo/schemas';
import { COPILOT_DEFAULTS } from '../ai/feature-models';
import type { Env } from '../config/env.schema';
import { AppSetting } from './setting.schema';
import { decryptSecret, encryptSecret } from './settings-crypto';

const SECRET_KEYS: Record<SecretNameType, string> = {
  googleApiKey: 'secret:googleApiKey',
  bedrockApiKey: 'secret:bedrockApiKey',
};

type ChangeListener = () => void | Promise<void>;

/**
 * Runtime settings with precedence: database > .env seed > built-in default.
 * Cached in memory; a periodic refresh picks up changes made by other
 * instances (multi-replica deployments). Subscribers (model registry, CORS)
 * are notified whenever the effective values change — nothing needs a
 * restart. See docs/guidelines/configuration.md.
 */
@Injectable()
export class SettingsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SettingsService.name);
  private readonly listeners = new Set<ChangeListener>();
  private refreshTimer?: NodeJS.Timeout;
  /** Serializes update/reload so a slow periodic tick can't clobber a save. */
  private opChain: Promise<unknown> = Promise.resolve();

  private ai!: AiSettings;
  private general!: GeneralSettings;
  private secrets: Record<SecretNameType, string | null> = {
    googleApiKey: null,
    bedrockApiKey: null,
  };

  constructor(
    @InjectModel(AppSetting.name) private readonly model: Model<AppSetting>,
    private readonly configService: ConfigService<Env, true>,
  ) {
    // Synchronous env-seeded state so consumers work before Mongo responds
    // (and in OPENAPI_EMIT mode). parse() restores boot fail-fast: garbage
    // env seeds refuse to start instead of entering live state unvalidated.
    this.ai = AiSettingsSchema.parse(this.envSeededAi());
    this.general = GeneralSettingsSchema.parse(this.envSeededGeneral());
    this.secrets = this.envSeededSecrets();
  }

  async onModuleInit(): Promise<void> {
    if (process.env.OPENAPI_EMIT === '1') return;
    await this.serialize(() => this.reload()).catch((error) => {
      this.logger.error(`initial settings load failed: ${String(error)}`);
    });
    // Catch cross-instance edits; local edits refresh immediately.
    this.refreshTimer = setInterval(() => {
      void this.serialize(() => this.reload()).catch((error) => {
        // Never silent: after e.g. an encryption-key rotation this is the
        // only signal that stored secrets can no longer be decrypted.
        this.logger.error(`periodic settings reload failed: ${String(error)}`);
      });
    }, 30_000);
    this.refreshTimer.unref();
  }

  onModuleDestroy(): void {
    if (this.refreshTimer) clearInterval(this.refreshTimer);
  }

  getAi(): AiSettings {
    return this.ai;
  }

  getGeneral(): GeneralSettings {
    return this.general;
  }

  /** Decrypted secret for INTERNAL use (provider construction) — never serialize. */
  getSecret(name: SecretNameType): string | null {
    return this.secrets[name];
  }

  onChange(listener: ChangeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Masked projection for the settings API/UI — secrets never leave as values. */
  toResponse(): SettingsResponse {
    const mask = (value: string | null) => ({
      set: Boolean(value),
      hint: value ? `…${value.slice(-4)}` : null,
    });
    return {
      ai: this.ai,
      general: this.general,
      secrets: {
        googleApiKey: mask(this.secrets.googleApiKey),
        bedrockApiKey: mask(this.secrets.bedrockApiKey),
      },
    };
  }

  /**
   * Validate → persist (only the sections the patch touches) → refresh the
   * cache → notify subscribers. The merged result is validated as a WHOLE
   * before anything is written; a bad save is a 400, never a half-write.
   */
  async update(patch: SettingsUpdate, updatedBy: string): Promise<SettingsResponse> {
    return this.serialize(async () => {
      const nextAi = this.parseOr400(AiSettingsSchema, {
        ...this.ai,
        ...patch.ai,
        copilot: { ...this.ai.copilot, ...patch.ai?.copilot },
      });
      const nextGeneral = this.parseOr400(GeneralSettingsSchema, {
        ...this.general,
        ...patch.general,
      });
      const nextSecrets = { ...this.secrets };
      for (const name of Object.keys(SECRET_KEYS) as SecretNameType[]) {
        const incoming = patch.secrets?.[name];
        if (incoming === undefined) continue;
        // null clears the stored secret → fall back to the .env seed if set.
        nextSecrets[name] = incoming ?? this.envSecret(name);
      }

      this.assertCoherent(nextAi, nextSecrets);

      // Persist only what the patch touches — a secrets-only update must not
      // freeze the current env-seeded ai/general values into the database.
      const masterKey = this.masterKey();
      const writes: Array<{ key: string; value: string; encrypted: boolean }> = [];
      if (patch.ai) writes.push({ key: 'ai', value: JSON.stringify(nextAi), encrypted: false });
      if (patch.general) {
        writes.push({ key: 'general', value: JSON.stringify(nextGeneral), encrypted: false });
      }
      for (const name of Object.keys(SECRET_KEYS) as SecretNameType[]) {
        const incoming = patch.secrets?.[name];
        if (incoming === undefined) continue;
        if (incoming === null) {
          await this.model.deleteOne({ _id: SECRET_KEYS[name] });
        } else {
          writes.push({
            key: SECRET_KEYS[name],
            value: encryptSecret(incoming, masterKey, SECRET_KEYS[name]),
            encrypted: true,
          });
        }
      }
      for (const write of writes) {
        await this.model.updateOne(
          { _id: write.key },
          { $set: { value: write.value, encrypted: write.encrypted, updatedBy } },
          { upsert: true },
        );
      }

      this.ai = nextAi;
      this.general = nextGeneral;
      this.secrets = nextSecrets;
      await this.notify();
      this.logger.log(`runtime settings updated by ${updatedBy}`);
      return this.toResponse();
    });
  }

  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.opChain.then(operation, operation);
    // Keep the chain alive even when an operation rejects.
    this.opChain = next.catch(() => undefined);
    return next;
  }

  private async reload(): Promise<void> {
    const rows = await this.model.find().lean();
    const byKey = new Map(rows.map((row) => [row._id, row]));
    const masterKey = this.masterKey();

    const before = this.snapshot();

    const aiRow = byKey.get('ai');
    this.ai = aiRow
      ? AiSettingsSchema.parse(JSON.parse(aiRow.value))
      : AiSettingsSchema.parse(this.envSeededAi());
    const generalRow = byKey.get('general');
    this.general = generalRow
      ? GeneralSettingsSchema.parse(JSON.parse(generalRow.value))
      : GeneralSettingsSchema.parse(this.envSeededGeneral());

    for (const name of Object.keys(SECRET_KEYS) as SecretNameType[]) {
      const row = byKey.get(SECRET_KEYS[name]);
      this.secrets[name] = row
        ? decryptSecret(row.value, masterKey, SECRET_KEYS[name])
        : this.envSecret(name);
    }

    // Only wake subscribers (registry rebuilds, log lines) on real change.
    if (this.snapshot() !== before) await this.notify();
  }

  private snapshot(): string {
    return JSON.stringify([this.ai, this.general, this.secrets]);
  }

  private async notify(): Promise<void> {
    for (const listener of this.listeners) {
      try {
        await listener();
      } catch (error) {
        this.logger.error(`settings listener failed: ${String(error)}`);
      }
    }
  }

  private parseOr400<S extends z.ZodType>(schema: S, value: unknown): z.output<S> {
    const result = schema.safeParse(value);
    if (!result.success) {
      const issue = result.error.issues[0];
      throw new BadRequestException(
        `invalid settings: ${issue?.path.join('.') ?? ''} ${issue?.message ?? 'validation failed'}`,
      );
    }
    return result.data as z.output<S>;
  }

  /** Reject configurations that would break AI at request time. */
  private assertCoherent(ai: AiSettings, secrets: Record<SecretNameType, string | null>): void {
    if (ai.providerMode !== 'auto') return;
    const provider = ai.copilot.model.split(':')[0];
    if (provider === 'google' && !secrets.googleApiKey) {
      throw new BadRequestException(
        'copilot model uses google but no Gemini API key is set (secrets.googleApiKey)',
      );
    }
    if (provider === 'bedrock' && !secrets.bedrockApiKey) {
      throw new BadRequestException(
        'copilot model uses bedrock but no Bedrock API key is set (secrets.bedrockApiKey)',
      );
    }
  }

  private masterKey(): string {
    return this.configService.get('SETTINGS_ENCRYPTION_KEY', { infer: true });
  }

  private get<K extends keyof Env>(key: K): Env[K] {
    return this.configService.get(key, { infer: true });
  }

  private envSeededAi(): AiSettings {
    return {
      providerMode: this.get('AI_PROVIDER_MODE'),
      awsRegion: this.get('AWS_REGION'),
      dailyTokenBudget: this.get('AI_DAILY_TOKEN_BUDGET'),
      copilot: {
        ...COPILOT_DEFAULTS,
        // `||` (not `??`): an unset-but-present env var arrives as ''.
        model:
          this.get('AI_MODEL_COPILOT_CHAT') ||
          (this.get('AI_PROVIDER_MODE') === 'mock' ? 'mock:copilot-chat' : COPILOT_DEFAULTS.model),
      },
    };
  }

  private envSeededGeneral(): GeneralSettings {
    return {
      corsOrigins: this.get('CORS_ORIGINS'),
      requireEmailVerification: this.get('REQUIRE_EMAIL_VERIFICATION'),
      // `||` (not `??`): an unset-but-present env var arrives as ''.
      googleClientId: this.get('GOOGLE_OAUTH_CLIENT_ID') || null,
    };
  }

  private envSecret(name: SecretNameType): string | null {
    // `|| null` also normalizes empty strings (unset-but-present env vars).
    if (name === 'googleApiKey') return this.get('GOOGLE_GENERATIVE_AI_API_KEY') || null;
    return this.get('AWS_BEARER_TOKEN_BEDROCK') || null;
  }

  private envSeededSecrets(): Record<SecretNameType, string | null> {
    return {
      googleApiKey: this.envSecret('googleApiKey'),
      bedrockApiKey: this.envSecret('bedrockApiKey'),
    };
  }
}
