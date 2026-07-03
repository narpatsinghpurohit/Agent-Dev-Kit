import { useLogin } from './login.hook';
import { LoginView } from './login.view';

export function LoginPage({ redirectTo }: { redirectTo?: string }) {
  const viewModel = useLogin(redirectTo);
  return <LoginView {...viewModel} />;
}
