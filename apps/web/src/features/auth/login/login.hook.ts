import { useForm } from '@tanstack/react-form';
import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { LoginSchema } from '@repo/schemas';
import { login } from '../../../lib/auth';
import { useGoogleSignin } from '../google-signin/google-signin.hook';

/**
 * ViewModel for the login screen: form state, submission, server errors.
 * The view is pure — everything it needs comes from here.
 */
export function useLogin(redirectTo?: string) {
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);
  const google = useGoogleSignin(redirectTo);

  const form = useForm({
    defaultValues: { email: '', password: '' },
    validators: { onSubmit: LoginSchema },
    onSubmit: async ({ value }) => {
      setServerError(null);
      try {
        await login(value);
        await navigate({ to: redirectTo ?? '/tasks' });
      } catch (error) {
        setServerError(error instanceof Error ? error.message : 'Login failed');
      }
    },
  });

  return { form, serverError, google };
}

export type LoginViewModel = ReturnType<typeof useLogin>;
