/// <reference types="google.accounts" />

/**
 * Singleton loader for the Google Identity Services script. The script must
 * load from Google (never self-host/bundle — they rotate it for security
 * fixes) and must never be removed once added: it is shared by every
 * consumer, and removal breaks StrictMode double-invoked effects.
 */
const GSI_SRC = 'https://accounts.google.com/gsi/client';

let loader: Promise<void> | null = null;

export function loadGoogleIdentity(): Promise<void> {
  loader ??= new Promise<void>((resolve, reject) => {
    if (typeof google !== 'undefined' && google.accounts?.id) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = GSI_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      // Allow a retry on the next call instead of caching the failure.
      loader = null;
      script.remove();
      reject(new Error('Google sign-in could not load'));
    };
    document.head.append(script);
  });
  return loader;
}
