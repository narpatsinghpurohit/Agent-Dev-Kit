import { TriangleAlert } from 'lucide-react';
import { LANGUAGE_NAMES } from '@repo/schemas';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '../../../components/ui/tabs';
import type { ConsoleViewModel, RightTab } from './console.hook';
import { Composer } from './parts/composer';
import { ContextStrip } from './parts/context-strip';
import { EhrPane } from './parts/ehr-pane';
import { PatientPanel } from './parts/patient-panel';
import { PlanPane } from './parts/plan-pane';
import { Transcript } from './parts/transcript';

/**
 * Pure props → JSX (lint-enforced). Three columns inside the shell content
 * area — patient context (272px) · live conversation (fluid) · EHR/plan
 * tabs (356px) — under a slim consultation context strip. `h-full min-h-0`
 * so only the inner panes scroll, never the page.
 */
export function ConsoleView(viewModel: ConsoleViewModel) {
  const {
    consultation,
    patient,
    alerts,
    rightTab,
    elapsed,
    latestDetectedLanguage,
    error,
    isFinishing,
    onFinish,
    onDismissAlert,
    onRightTabChange,
  } = viewModel;
  const inProgress = consultation.status === 'in_progress';
  const topAlert = alerts[0] ?? null;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-edge bg-panel shadow-sm">
      <ContextStrip consultation={consultation} doctorName={viewModel.doctorName} />

      <div className="flex min-h-0 flex-1">
        <PatientPanel
          patient={patient}
          clinical={viewModel.clinical}
          latestVital={viewModel.latestVital}
          vitalTrends={viewModel.vitalTrends}
          queue={viewModel.queue}
        />

        <main className="flex min-h-0 min-w-0 flex-1 flex-col bg-surface">
          {topAlert ? (
            <div className="mx-5 mt-3 flex items-center gap-2.5 rounded-md border border-warn/40 bg-warn/10 px-3.5 py-2 text-[12.5px] text-warn">
              <TriangleAlert aria-hidden className="size-[15px] flex-none" />
              <span className="flex-1">
                <strong className="font-semibold">{topAlert.title}</strong> · {topAlert.detail}
              </span>
              <button
                type="button"
                onClick={() => void onDismissAlert(topAlert.id)}
                className="px-1.5 py-0.5 text-xs font-semibold hover:opacity-70"
              >
                Dismiss
              </button>
            </div>
          ) : null}

          <div className="flex items-center gap-2.5 px-5 pb-2 pt-3.5">
            <span className="text-[15px] font-semibold">Live consultation</span>
            {inProgress ? (
              <Badge className="gap-1.5 text-[11.5px]">
                <span
                  aria-hidden
                  className="size-1.5 animate-vedita-blink rounded-full bg-accent"
                />
                Vedita listening · {latestDetectedLanguage} detected
              </Badge>
            ) : (
              <Badge variant="success">Completed</Badge>
            )}
            <div className="flex-1" />
            <span className="font-mono text-xs text-ink-dim">{elapsed} elapsed</span>
            {inProgress ? (
              <Button
                size="sm"
                onClick={() => void onFinish()}
                disabled={isFinishing || consultation.turns.length === 0}
              >
                {isFinishing ? 'Summarizing…' : 'Finish & summarize'}
              </Button>
            ) : null}
          </div>

          <Transcript
            turns={consultation.turns}
            patientName={patient?.name ?? 'Patient'}
            doctorName={viewModel.doctorName}
            patientLanguageName={LANGUAGE_NAMES[consultation.patientLanguage]}
          />

          {error ? (
            <p role="alert" className="px-5 pb-1 text-sm text-danger">
              {error}
            </p>
          ) : null}

          {inProgress ? (
            <Composer
              consultation={consultation}
              quickAsks={viewModel.quickAsks}
              question={viewModel.question}
              patientText={viewModel.patientText}
              isRecording={viewModel.isRecording}
              isAsking={viewModel.isAsking}
              isAnswering={viewModel.isAnswering}
              micAvailable={viewModel.micAvailable}
              onQuickAsk={viewModel.onQuickAsk}
              onQuestionChange={viewModel.onQuestionChange}
              onPatientTextChange={viewModel.onPatientTextChange}
              onAsk={viewModel.onAsk}
              onAnswerText={viewModel.onAnswerText}
              onToggleRecording={viewModel.onToggleRecording}
            />
          ) : null}
        </main>

        <aside className="flex w-[356px] flex-none flex-col border-l border-edge bg-panel">
          <div className="px-4 pt-3.5">
            <Tabs value={rightTab} onValueChange={(value) => onRightTabChange(value as RightTab)}>
              <TabsList className="w-full">
                <TabsTrigger value="ehr">EHR draft</TabsTrigger>
                <TabsTrigger value="plan">Treatment plan</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          {rightTab === 'ehr' ? (
            <EhrPane
              consultation={consultation}
              ehrFields={viewModel.ehrFields}
              capturedCount={viewModel.capturedCount}
              isSigning={viewModel.isSigning}
              isSavingSummary={viewModel.isSavingSummary}
              onSignAhmis={viewModel.onSignAhmis}
              onSaveSummary={viewModel.onSaveSummary}
            />
          ) : (
            <PlanPane
              consultation={consultation}
              isGeneratingPlan={viewModel.isGeneratingPlan}
              isUpdatingPlan={viewModel.isUpdatingPlan}
              onGeneratePlan={viewModel.onGeneratePlan}
              onRecommendationUpdate={viewModel.onRecommendationUpdate}
            />
          )}
        </aside>
      </div>
    </div>
  );
}
