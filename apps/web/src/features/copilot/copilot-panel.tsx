import { useCopilotPanel } from './copilot-panel.hook';
import { CopilotPanelView } from './copilot-panel.view';

export function CopilotPanel() {
  const viewModel = useCopilotPanel();
  return <CopilotPanelView {...viewModel} />;
}
