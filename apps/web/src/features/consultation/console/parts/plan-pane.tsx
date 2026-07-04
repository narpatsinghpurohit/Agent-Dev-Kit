import { Sparkles } from 'lucide-react';
import { useState } from 'react';
import { TREATMENT_CATEGORY_LABELS, type TreatmentCategory } from '@repo/schemas';
import { Badge } from '../../../../components/ui/badge';
import { Button } from '../../../../components/ui/button';
import { Textarea } from '../../../../components/ui/textarea';
import { cn } from '../../../../lib/utils';
import type { ConsoleViewModel } from '../console.hook';

type Plan = NonNullable<ConsoleViewModel['consultation']['treatmentPlan']>;
type PlanItem = Plan['items'][number];

const CATEGORY_GLYPHS: Record<TreatmentCategory, { letter: string; className: string }> = {
  herbal: { letter: 'H', className: 'bg-badge-green text-badge-green-fg' },
  ahara: { letter: 'D', className: 'bg-badge-orange text-badge-orange-fg' },
  vihara: { letter: 'Y', className: 'bg-badge-purple text-badge-purple-fg' },
};

/**
 * Right column, "Treatment plan" tab: the cohort rationale banner, one card
 * per recommendation (category glyph, mono confidence, body, evidence,
 * Accept/Modify actions that flip into persisted state chips), the
 * generate-plan empty state, and the feedback footer.
 */
export function PlanPane({
  consultation,
  isGeneratingPlan,
  isUpdatingPlan,
  onGeneratePlan,
  onRecommendationUpdate,
}: Pick<
  ConsoleViewModel,
  | 'consultation'
  | 'isGeneratingPlan'
  | 'isUpdatingPlan'
  | 'onGeneratePlan'
  | 'onRecommendationUpdate'
>) {
  const plan = consultation.treatmentPlan;

  if (!plan) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <Sparkles aria-hidden className="size-6 text-accent" />
        {consultation.status === 'completed' ? (
          <>
            <p className="text-sm text-ink-dim">
              No plan yet — Vedita drafts one from the record, the patient&rsquo;s history, and
              outcomes of similar patients.
            </p>
            <Button disabled={isGeneratingPlan} onClick={() => void onGeneratePlan()}>
              {isGeneratingPlan ? 'Generating…' : 'Generate plan'}
            </Button>
          </>
        ) : (
          <p className="text-sm text-ink-dim">
            Finish the consultation to generate a personalised treatment plan.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-auto p-4">
      <div className="rounded-md bg-accent-soft p-3 text-xs leading-relaxed text-accent-deep">
        {plan.rationale}
        {plan.cohortSize != null ? (
          <>
            {' '}
            · based on outcomes of{' '}
            <strong>{plan.cohortSize.toLocaleString()} similar patients</strong> across AHMIS.
          </>
        ) : null}
      </div>

      {plan.items.map((item) => (
        <RecommendationCard
          key={item.id}
          item={item}
          isUpdatingPlan={isUpdatingPlan}
          onRecommendationUpdate={onRecommendationUpdate}
        />
      ))}

      <div className="mt-auto border-t border-edge pt-2.5 text-[11px] text-ink-dim">
        Recommendations improve with your feedback — accepted and modified plans retrain Vedita on
        real outcomes.
      </div>
    </div>
  );
}

function RecommendationCard({
  item,
  isUpdatingPlan,
  onRecommendationUpdate,
}: {
  item: PlanItem;
  isUpdatingPlan: boolean;
  onRecommendationUpdate: ConsoleViewModel['onRecommendationUpdate'];
}) {
  const [modifying, setModifying] = useState(false);
  const [draft, setDraft] = useState(item.editedBody ?? item.body);
  const glyph = CATEGORY_GLYPHS[item.category];
  const body = item.state === 'modified' && item.editedBody ? item.editedBody : item.body;

  return (
    <div className="flex flex-col gap-2 rounded-md border border-edge bg-panel px-3 py-2.5">
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className={cn(
            'flex size-[26px] flex-none items-center justify-center rounded-sm text-xs font-bold',
            glyph.className,
          )}
        >
          {glyph.letter}
        </span>
        <span className="text-[13.5px] font-semibold">
          {TREATMENT_CATEGORY_LABELS[item.category]}
        </span>
        <div className="flex-1" />
        <span className="font-mono text-[10.5px] text-ok">{item.confidence.toFixed(2)}</span>
      </div>
      <div className="text-[13px] leading-relaxed">{body}</div>
      {item.evidence ? <div className="text-[11px] text-ink-dim">{item.evidence}</div> : null}

      {modifying ? (
        <form
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (!draft.trim()) return;
            setModifying(false);
            void onRecommendationUpdate(item.id, 'modified', draft.trim());
          }}
        >
          <Textarea
            aria-label={`Modify ${TREATMENT_CATEGORY_LABELS[item.category]} recommendation`}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            maxLength={1000}
            className="min-h-16 text-[13px]"
          />
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={isUpdatingPlan || !draft.trim()}>
              Save
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setModifying(false)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : item.state === 'suggested' ? (
        <div className="flex gap-2">
          <button
            type="button"
            disabled={isUpdatingPlan}
            onClick={() => void onRecommendationUpdate(item.id, 'accepted')}
            className="rounded-md bg-ok-soft px-2.5 py-1 text-xs font-medium text-ok hover:bg-ok/15 disabled:opacity-50"
          >
            Accept
          </button>
          <Button type="button" size="sm" variant="outline" onClick={() => setModifying(true)}>
            Modify
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          {item.state === 'accepted' ? <Badge variant="success">Accepted</Badge> : null}
          {item.state === 'modified' ? <Badge>Modified</Badge> : null}
          {item.state === 'rejected' ? <Badge variant="secondary">Rejected</Badge> : null}
        </div>
      )}
    </div>
  );
}
