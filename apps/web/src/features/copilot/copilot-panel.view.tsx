import { ToolPartCard } from './components/tool-part-card';
import type { CopilotPanelViewModel } from './copilot-panel.hook';

/** Pure chat surface: messages (text + tool parts), approval UI, input row. */
export function CopilotPanelView({
  messages,
  status,
  error,
  input,
  isRecording,
  isTranscribing,
  micAvailable,
  onInputChange,
  onSubmit,
  onApproval,
  onToggleRecording,
  onSpeak,
  onStop,
}: CopilotPanelViewModel) {
  const busy = status === 'submitted' || status === 'streaming';

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="copilot-panel">
      <div className="border-b border-edge px-4 py-3">
        <h2 className="text-sm font-semibold">Copilot</h2>
        <p className="text-xs text-ink-dim">
          Ask it to register patients or look up their history.
        </p>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <p className="text-sm text-ink-dim">
            Try: <em>“Register a patient called Asha Devi, age 54”</em>
          </p>
        ) : null}

        {messages.map((message) => (
          <div key={message.id} data-role={message.role}>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-dim">
              {message.role === 'user' ? 'You' : 'Copilot'}
            </p>
            <div className="space-y-2">
              {message.parts.map((part, index) => {
                if (part.type === 'text') {
                  return (
                    // eslint-disable-next-line @eslint-react/no-array-index-key -- UIMessage parts have no ids; the array is append-only while streaming
                    <div key={index} className="group flex items-start gap-2">
                      <p className="whitespace-pre-wrap text-sm leading-relaxed">{part.text}</p>
                      {message.role === 'assistant' && part.text ? (
                        <button
                          type="button"
                          title="Read aloud"
                          aria-label="Read aloud"
                          onClick={() => onSpeak(part.text)}
                          className="invisible text-xs group-hover:visible"
                        >
                          🔊
                        </button>
                      ) : null}
                    </div>
                  );
                }
                if (part.type.startsWith('tool-')) {
                  return (
                    <ToolPartCard
                      // eslint-disable-next-line @eslint-react/no-array-index-key -- UIMessage parts have no ids; the array is append-only while streaming
                      key={index}
                      part={part as Parameters<typeof ToolPartCard>[0]['part']}
                      onApproval={onApproval}
                    />
                  );
                }
                return null;
              })}
            </div>
          </div>
        ))}

        {busy ? <p className="text-xs text-ink-dim">Thinking…</p> : null}
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error.message}
          </p>
        ) : null}
      </div>

      <form
        className="flex items-end gap-2 border-t border-edge p-3"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        {micAvailable ? (
          <button
            type="button"
            onClick={() => void onToggleRecording()}
            title={isRecording ? 'Stop recording' : 'Dictate'}
            aria-pressed={isRecording}
            className={`rounded-md px-2 py-2 text-lg ${isRecording ? 'animate-pulse bg-danger/20' : 'hover:bg-edge'}`}
          >
            🎙️
          </button>
        ) : null}
        <textarea
          rows={1}
          value={input}
          placeholder={isTranscribing ? 'Transcribing…' : 'Message the copilot'}
          onChange={(event) => onInputChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              onSubmit();
            }
          }}
          className="max-h-32 flex-1 resize-none rounded-md border border-edge bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
        />
        {busy ? (
          <button
            type="button"
            onClick={() => void onStop()}
            className="rounded-md border border-edge px-3 py-2 text-sm text-ink-dim hover:text-ink"
          >
            Stop
          </button>
        ) : (
          <button
            type="submit"
            disabled={!input.trim()}
            className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent-soft disabled:opacity-50"
          >
            Send
          </button>
        )}
      </form>
    </div>
  );
}
