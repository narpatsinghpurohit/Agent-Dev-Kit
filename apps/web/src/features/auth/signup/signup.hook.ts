import { useForm } from '@tanstack/react-form';
import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { SignupSchema } from '@repo/schemas';
import { signup } from '../../../lib/auth';

export function useSignup() {
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm({
    defaultValues: { name: '', email: '', password: '' },
    validators: { onSubmit: SignupSchema },
    onSubmit: async ({ value }) => {
      setServerError(null);
      try {
        await signup(value);
        await navigate({ to: '/tasks' });
      } catch (error) {
        setServerError(error instanceof Error ? error.message : 'Signup failed');
      }
    },
  });

  return { form, serverError };
}

export type SignupViewModel = ReturnType<typeof useSignup>;
