import { useNavigate } from '@tanstack/react-router';
import { useCallback, useState } from 'react';
import { useAuthConfig } from '@repo/api-client';
import { loginWithGoogle } from '../../../lib/auth';
import { loadGoogleIdentity } from '../../../lib/google-identity';

/**
 * ViewModel slice for the Google button, composed by the login/signup hooks.
 * Google renders the button itself (an iframe — the ID-token flow requires
 * Google's own button), so the view's whole job is `<div ref={buttonRef} />`.
 * The callback ref fires only when the container actually mounts, which the
 * views gate on `enabled` — so client ID and DOM node are both ready here.
 */
export function useGoogleSignin(redirectTo?: string) {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  // Public endpoint; the login route's loader has already prefetched it.
  const { data } = useAuthConfig();
  const clientId = data?.googleClientId ?? null;

  const buttonRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (!node || !clientId) return;
      loadGoogleIdentity()
        .then(() => {
          // StrictMode re-attaches refs and GIS appends a fresh iframe per
          // renderButton call — reset the container so this is idempotent.
          if (!node.isConnected) return;
          node.replaceChildren();
          google.accounts.id.initialize({
            client_id: clientId,
            callback: (response) => {
              void loginWithGoogle({ credential: response.credential })
                .then(() => navigate({ to: redirectTo ?? '/tasks' }))
                .catch((cause) => {
                  setError(cause instanceof Error ? cause.message : 'Google sign-in failed');
                });
            },
          });
          google.accounts.id.renderButton(node, {
            type: 'standard',
            theme: 'outline',
            size: 'large',
            text: 'continue_with',
            width: 320, // px — the iframe ignores CSS; 400 is Google's max
          });
        })
        .catch((cause) => {
          setError(cause instanceof Error ? cause.message : 'Google sign-in could not load');
        });
    },
    [clientId, navigate, redirectTo],
  );

  return { enabled: Boolean(clientId), buttonRef, error };
}

export type GoogleSigninViewModel = ReturnType<typeof useGoogleSignin>;
