import { useSignup } from './signup.hook';
import { SignupView } from './signup.view';

export function SignupPage() {
  const viewModel = useSignup();
  return <SignupView {...viewModel} />;
}
