import { useDashboardPage } from './dashboard-page.hook';
import { DashboardPageView } from './dashboard-page.view';

export function DashboardPage() {
  const viewModel = useDashboardPage();
  return <DashboardPageView {...viewModel} />;
}
