import { useConsole } from './console.hook';
import { ConsoleView } from './console.view';

export function ConsolePage({ consultationId }: { consultationId: string }) {
  const viewModel = useConsole(consultationId);
  return <ConsoleView {...viewModel} />;
}
