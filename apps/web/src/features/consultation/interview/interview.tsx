import { useInterview } from './interview.hook';
import { InterviewView } from './interview.view';

export function InterviewPage({ consultationId }: { consultationId: string }) {
  const viewModel = useInterview(consultationId);
  return <InterviewView {...viewModel} />;
}
