/**
 * Pure renderer for a tool invocation UI part, including the human-in-the-
 * loop approval prompt. Follows the AI Elements Tool component pattern.
 */
interface ToolPartLike {
  type: string;
  state: string;
  input?: unknown;
  output?: unknown;
  errorText?: string;
  approval?: { id: string; approved?: boolean };
}

const TOOL_LABEL: Record<string, string> = {
  'tool-listPatients': 'List patients',
  'tool-createPatient': 'Register patient',
  'tool-getPatientHistory': 'Patient history',
};

export function ToolPartCard({
  part,
  onApproval,
}: {
  part: ToolPartLike;
  onApproval: (approvalId: string, approved: boolean) => void;
}) {
  const label = TOOL_LABEL[part.type] ?? part.type.replace(/^tool-/, '');

  return (
    <div className="rounded-lg border border-edge bg-surface/60 p-3 text-sm">
      <div className="mb-1 flex items-center gap-2">
        <span aria-hidden>🛠️</span>
        <span className="font-medium">{label}</span>
        <StateBadge state={part.state} />
      </div>

      {part.input !== undefined && part.state !== 'input-streaming' ? (
        <pre className="overflow-x-auto rounded bg-surface p-2 text-xs text-ink-dim">
          {JSON.stringify(part.input, null, 2)}
        </pre>
      ) : null}

      {part.state === 'approval-requested' && part.approval ? (
        <div className="mt-2 flex items-center gap-2">
          <span className="text-ink-dim">Allow this?</span>
          <button
            type="button"
            onClick={() => onApproval(part.approval!.id, true)}
            className="rounded bg-ok/20 px-2 py-1 text-xs font-medium text-ok"
          >
            Approve
          </button>
          <button
            type="button"
            onClick={() => onApproval(part.approval!.id, false)}
            className="rounded bg-danger/20 px-2 py-1 text-xs font-medium text-danger"
          >
            Deny
          </button>
        </div>
      ) : null}

      {part.state === 'output-error' && part.errorText ? (
        <p className="mt-1 text-xs text-danger">{part.errorText}</p>
      ) : null}
    </div>
  );
}

function StateBadge({ state }: { state: string }) {
  const label =
    state === 'output-available'
      ? 'done'
      : state === 'approval-requested'
        ? 'needs approval'
        : state === 'output-denied'
          ? 'denied'
          : state === 'output-error'
            ? 'failed'
            : 'running…';
  return <span className="rounded-full bg-edge px-2 py-0.5 text-xs text-ink-dim">{label}</span>;
}
