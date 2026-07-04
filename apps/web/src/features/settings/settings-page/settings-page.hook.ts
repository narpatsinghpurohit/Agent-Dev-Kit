import { useForm } from '@tanstack/react-form';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import {
  useChatModelsSuspense,
  useSettingsGetSuspense,
  useSettingsUpdate,
  getSettingsGetUrl,
  getChatModelsUrl,
} from '@repo/api-client';
import {
  RuntimeTunableFeatureSchema,
  SettingsUpdateSchema,
  type RuntimeTunableFeature,
  type SecretNameType,
  type SettingsUpdate,
} from '@repo/schemas';

/** 'consultation-extract' → 'Consultation extract'. */
function humanizeFeature(feature: string): string {
  const words = feature.replace(/-/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * ViewModel for the runtime-settings screen. Numeric fields are edited as
 * strings and parsed on submit through the SAME SettingsUpdateSchema the API
 * enforces; secrets are write-only (blank input = unchanged, Remove = clear).
 */
export function useSettingsPage() {
  const queryClient = useQueryClient();
  const { data: settings, refetch } = useSettingsGetSuspense();
  const { data: modelsInfo } = useChatModelsSuspense();
  const updateMutation = useSettingsUpdate();
  const [serverError, setServerError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const effectiveModels = modelsInfo.features;

  // Per-feature override drafts, edited as plain strings ('' = no override).
  // They live outside the tanstack form because the rows are dynamic; the
  // submit handler below diffs them against the stored overrides.
  const [featureModelDrafts, setFeatureModelDrafts] = useState<
    Record<RuntimeTunableFeature, string>
  >(
    () =>
      Object.fromEntries(
        RuntimeTunableFeatureSchema.options.map((feature) => [
          feature,
          settings.ai.featureModels[feature] ?? '',
        ]),
      ) as Record<RuntimeTunableFeature, string>,
  );

  const invalidate = useCallback(async () => {
    const prefixes = [getSettingsGetUrl(), getChatModelsUrl()];
    await queryClient.invalidateQueries({
      predicate: (query) =>
        query.queryKey.some(
          (part) => typeof part === 'string' && prefixes.some((p) => part.startsWith(p)),
        ),
    });
  }, [queryClient]);

  const submit = useCallback(
    async (patch: SettingsUpdate) => {
      setServerError(null);
      setSavedAt(null);
      try {
        await updateMutation.mutateAsync({ data: patch });
        await invalidate();
        setSavedAt(Date.now());
      } catch (error) {
        setServerError(error instanceof Error ? error.message : 'Saving failed');
        throw error;
      }
    },
    [invalidate, updateMutation],
  );

  const form = useForm({
    defaultValues: {
      model: settings.ai.copilot.model,
      temperature: String(settings.ai.copilot.temperature),
      maxOutputTokens: String(settings.ai.copilot.maxOutputTokens),
      topP: settings.ai.copilot.topP == null ? '' : String(settings.ai.copilot.topP),
      providerMode: settings.ai.providerMode,
      awsRegion: settings.ai.awsRegion,
      dailyTokenBudget: String(settings.ai.dailyTokenBudget),
      corsOrigins: settings.general.corsOrigins.join('\n'),
      requireEmailVerification: settings.general.requireEmailVerification,
      googleClientId: settings.general.googleClientId ?? '',
      googleApiKey: '',
      bedrockApiKey: '',
      sarvamApiKey: '',
    },
    onSubmit: async ({ value, formApi }) => {
      // Only touched overrides go into the patch: emptied where one is stored
      // = null (clear, falls back to the env seed/default); unchanged = omit.
      const featureModelsPatch: Partial<Record<RuntimeTunableFeature, string | null>> = {};
      for (const feature of RuntimeTunableFeatureSchema.options) {
        const draft = featureModelDrafts[feature].trim();
        const saved = settings.ai.featureModels[feature] ?? '';
        if (draft === saved) continue;
        featureModelsPatch[feature] = draft === '' ? null : draft;
      }
      const candidate = {
        ai: {
          providerMode: value.providerMode,
          awsRegion: value.awsRegion.trim(),
          dailyTokenBudget: Number(value.dailyTokenBudget),
          copilot: {
            model: value.model.trim(),
            temperature: Number(value.temperature),
            maxOutputTokens: Number(value.maxOutputTokens),
            topP: value.topP.trim() === '' ? null : Number(value.topP),
          },
          ...(Object.keys(featureModelsPatch).length > 0
            ? { featureModels: featureModelsPatch }
            : {}),
        },
        general: {
          corsOrigins: value.corsOrigins
            .split('\n')
            .map((origin: string) => origin.trim())
            .filter(Boolean),
          requireEmailVerification: value.requireEmailVerification,
          // Empty = disable Google sign-in (the button disappears).
          googleClientId: value.googleClientId.trim() || null,
        },
        // Blank secret inputs mean "leave unchanged" — omit them entirely.
        secrets: {
          ...(value.googleApiKey.trim() ? { googleApiKey: value.googleApiKey.trim() } : {}),
          ...(value.bedrockApiKey.trim() ? { bedrockApiKey: value.bedrockApiKey.trim() } : {}),
          ...(value.sarvamApiKey.trim() ? { sarvamApiKey: value.sarvamApiKey.trim() } : {}),
        },
      };
      const parsed = SettingsUpdateSchema.safeParse(candidate);
      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        setServerError(`${issue?.path.join('.')}: ${issue?.message}`);
        return;
      }
      const ok = await submit(parsed.data).then(
        () => true,
        () => false,
      );
      if (!ok) return; // keep typed-but-unsaved secrets in the inputs
      formApi.setFieldValue('googleApiKey', '');
      formApi.setFieldValue('bedrockApiKey', '');
      formApi.setFieldValue('sarvamApiKey', '');
      await refetch();
    },
  });

  const onClearSecret = useCallback(
    (name: SecretNameType) => {
      void submit({ secrets: { [name]: null } })
        .then(() => refetch())
        .catch(() => undefined);
    },
    [refetch, submit],
  );

  // One row per runtime-tunable feature: what serves it now, plus the
  // override draft. Clearing empties the draft; the save flow turns that
  // into a null patch entry.
  const featureModels = RuntimeTunableFeatureSchema.options.map((feature) => ({
    feature,
    label: humanizeFeature(feature),
    effectiveModel: effectiveModels.find((info) => info.feature === feature)?.model ?? null,
    override: featureModelDrafts[feature],
    onChange: (value: string) =>
      setFeatureModelDrafts((drafts) => ({ ...drafts, [feature]: value })),
    onClear: () => setFeatureModelDrafts((drafts) => ({ ...drafts, [feature]: '' })),
  }));

  return {
    form,
    featureModels,
    secrets: settings.secrets,
    serverError,
    savedAt,
    isSaving: updateMutation.isPending,
    onClearSecret,
  };
}

export type SettingsPageViewModel = ReturnType<typeof useSettingsPage>;
