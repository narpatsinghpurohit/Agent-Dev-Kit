import { useForm } from '@tanstack/react-form';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import {
  useSettingsGetSuspense,
  useSettingsUpdate,
  getSettingsGetUrl,
  getChatModelsUrl,
} from '@repo/api-client';
import { SettingsUpdateSchema, type SecretNameType, type SettingsUpdate } from '@repo/schemas';

/**
 * ViewModel for the runtime-settings screen. Numeric fields are edited as
 * strings and parsed on submit through the SAME SettingsUpdateSchema the API
 * enforces; secrets are write-only (blank input = unchanged, Remove = clear).
 */
export function useSettingsPage() {
  const queryClient = useQueryClient();
  const { data: settings, refetch } = useSettingsGetSuspense();
  const updateMutation = useSettingsUpdate();
  const [serverError, setServerError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

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
    },
    onSubmit: async ({ value, formApi }) => {
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

  return {
    form,
    secrets: settings.secrets,
    serverError,
    savedAt,
    isSaving: updateMutation.isPending,
    onClearSecret,
  };
}

export type SettingsPageViewModel = ReturnType<typeof useSettingsPage>;
