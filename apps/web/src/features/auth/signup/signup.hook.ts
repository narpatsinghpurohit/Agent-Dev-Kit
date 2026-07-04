import { useForm } from '@tanstack/react-form';
import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { SignupSchema } from '@repo/schemas';
import { signup } from '../../../lib/auth';
import { useGoogleSignin } from '../google-signin/google-signin.hook';

export function useSignup() {
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);
  const google = useGoogleSignin();

  const form = useForm({
    defaultValues: { name: '', email: '', password: '' },
    validators: { onSubmit: SignupSchema },
    onSubmit: async ({ value }) => {
      setServerError(null);
      try {
        await signup(value);
        await navigate({ to: '/dashboard' });
      } catch (error) {
        setServerError(error instanceof Error ? error.message : 'Signup failed');
      }
    },
  });

  return { form, serverError, google };
}

export type SignupViewModel = ReturnType<typeof useSignup>;
