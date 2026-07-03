import { useSettingsPage } from './settings-page.hook';
import { SettingsPageView } from './settings-page.view';

export function SettingsPage() {
  const viewModel = useSettingsPage();
  return <SettingsPageView {...viewModel} />;
}
