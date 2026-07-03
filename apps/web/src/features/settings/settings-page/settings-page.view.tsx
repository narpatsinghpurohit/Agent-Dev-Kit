import type { SecretNameType } from '@repo/schemas';
import { inputClass, primaryButtonClass } from '../../../components/form-styles';
import type { SettingsPageViewModel } from './settings-page.hook';

/** Pure settings surface: copilot, providers, general — one save. */
export function SettingsPageView({
  form,
  secrets,
  serverError,
  savedAt,
  isSaving,
  onClearSecret,
}: SettingsPageViewModel) {
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-1 text-2xl font-semibold">Settings</h1>
      <p className="mb-6 text-sm text-ink-dim">
        Runtime configuration — stored encrypted in the database and applied without a restart.
      </p>

      <form
        className="flex flex-col gap-8"
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
      >
        <Section
          title="Copilot"
          subtitle="Which model answers, and how. Applies to the next message."
        >
          <form.Field name="model">
            {(field) => (
              <Labeled
                label="Model"
                hint="provider:model-id — e.g. google:gemini-3.5-flash or bedrock:us.anthropic.claude-sonnet-5"
              >
                <input
                  className={inputClass}
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                />
              </Labeled>
            )}
          </form.Field>
          <div className="grid grid-cols-3 gap-4">
            <form.Field name="temperature">
              {(field) => (
                <Labeled label="Temperature" hint="0–2">
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="2"
                    className={inputClass}
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                  />
                </Labeled>
              )}
            </form.Field>
            <form.Field name="maxOutputTokens">
              {(field) => (
                <Labeled label="Max output tokens" hint="per reply">
                  <input
                    type="number"
                    min="1"
                    max="32768"
                    className={inputClass}
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                  />
                </Labeled>
              )}
            </form.Field>
            <form.Field name="topP">
              {(field) => (
                <Labeled label="Top-p" hint="blank = provider default">
                  <input
                    type="number"
                    step="0.05"
                    min="0"
                    max="1"
                    className={inputClass}
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                  />
                </Labeled>
              )}
            </form.Field>
          </div>
        </Section>

        <Section
          title="AI providers"
          subtitle="Keys are write-only: stored encrypted, shown only as a hint."
        >
          <form.Field name="providerMode">
            {(field) => (
              <Labeled
                label="Mode"
                hint="mock = keyless demo model; auto = real providers where keys exist"
              >
                <select
                  className={inputClass}
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value as 'mock' | 'auto')}
                >
                  <option value="mock">mock</option>
                  <option value="auto">auto</option>
                </select>
              </Labeled>
            )}
          </form.Field>
          <SecretField
            name="googleApiKey"
            label="Gemini API key"
            state={secrets.googleApiKey}
            form={form}
            onClear={onClearSecret}
          />
          <SecretField
            name="bedrockApiKey"
            label="Bedrock API key"
            state={secrets.bedrockApiKey}
            form={form}
            onClear={onClearSecret}
          />
          <div className="grid grid-cols-2 gap-4">
            <form.Field name="awsRegion">
              {(field) => (
                <Labeled label="AWS region">
                  <input
                    className={inputClass}
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                  />
                </Labeled>
              )}
            </form.Field>
            <form.Field name="dailyTokenBudget">
              {(field) => (
                <Labeled label="Daily token budget" hint="per user, all AI features">
                  <input
                    type="number"
                    min="1"
                    className={inputClass}
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                  />
                </Labeled>
              )}
            </form.Field>
          </div>
        </Section>

        <Section title="General">
          <form.Field name="corsOrigins">
            {(field) => (
              <Labeled
                label="Allowed browser origins"
                hint="one per line, e.g. https://app.example.com"
              >
                <textarea
                  rows={3}
                  className={inputClass}
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                />
              </Labeled>
            )}
          </form.Field>
          <form.Field name="requireEmailVerification">
            {(field) => (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={field.state.value}
                  onChange={(e) => field.handleChange(e.target.checked)}
                />
                Require verified email before login
              </label>
            )}
          </form.Field>
        </Section>

        {serverError ? (
          <p role="alert" className="text-sm text-danger">
            {serverError}
          </p>
        ) : null}
        {savedAt ? (
          <p role="status" className="text-sm text-ok">
            Saved — changes are live.
          </p>
        ) : null}

        <div>
          <button type="submit" disabled={isSaving} className={primaryButtonClass}>
            {isSaving ? 'Saving…' : 'Save settings'}
          </button>
        </div>
      </form>
    </div>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-edge bg-panel p-6">
      <h2 className="text-lg font-semibold">{title}</h2>
      {subtitle ? (
        <p className="mb-4 mt-1 text-xs text-ink-dim">{subtitle}</p>
      ) : (
        <div className="mb-4" />
      )}
      <div className="flex flex-col gap-4">{children}</div>
    </section>
  );
}

function Labeled({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span>
        {label} {hint ? <span className="text-xs text-ink-dim">({hint})</span> : null}
      </span>
      {children}
    </label>
  );
}

function SecretField({
  name,
  label,
  state,
  form,
  onClear,
}: {
  name: 'googleApiKey' | 'bedrockApiKey';
  label: string;
  state: { set: boolean; hint: string | null };
  form: SettingsPageViewModel['form'];
  onClear: (name: SecretNameType) => void;
}) {
  return (
    <form.Field name={name}>
      {(field) => (
        <Labeled label={label} hint={state.set ? `currently set (${state.hint})` : 'not set'}>
          <div className="flex gap-2">
            <input
              type="password"
              autoComplete="off"
              placeholder={state.set ? '•••••• (leave blank to keep)' : 'paste a key'}
              className={`${inputClass} flex-1`}
              value={field.state.value}
              onChange={(e) => field.handleChange(e.target.value)}
            />
            {state.set ? (
              <button
                type="button"
                onClick={() => onClear(name)}
                className="rounded-md border border-danger/40 px-3 text-sm text-danger hover:bg-danger/10"
              >
                Remove
              </button>
            ) : null}
          </div>
        </Labeled>
      )}
    </form.Field>
  );
}
