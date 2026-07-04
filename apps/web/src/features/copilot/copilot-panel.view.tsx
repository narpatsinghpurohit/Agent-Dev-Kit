import { Mic, Volume2 } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Textarea } from '../../components/ui/textarea';
import { cn } from '../../lib/utils';
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
        <h2 className="text-sm font-semibold">Vedita</h2>
        <p className="text-xs text-ink-dim">
          Ask Vedita to register patients or look up their history.
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
              {message.role === 'user' ? 'You' : 'Vedita'}
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
                          className="invisible text-ink-dim hover:text-ink group-hover:visible"
                        >
                          <Volume2 className="size-4" aria-hidden />
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
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => void onToggleRecording()}
            title={isRecording ? 'Stop recording' : 'Dictate'}
            aria-pressed={isRecording}
            className={cn(
              'text-ink-dim',
              isRecording &&
                'animate-pulse bg-danger-soft text-danger hover:bg-danger-soft hover:text-danger',
            )}
          >
            <Mic aria-hidden />
          </Button>
        ) : null}
        <Textarea
          rows={1}
          value={input}
          placeholder={isTranscribing ? 'Transcribing…' : 'Message Vedita'}
          onChange={(event) => onInputChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              onSubmit();
            }
          }}
          className="max-h-32 min-h-9 flex-1 resize-none"
        />
        {busy ? (
          <Button type="button" variant="outline" onClick={() => void onStop()}>
            Stop
          </Button>
        ) : (
          <Button type="submit" disabled={!input.trim()}>
            Send
          </Button>
        )}
      </form>
    </div>
  );
}
