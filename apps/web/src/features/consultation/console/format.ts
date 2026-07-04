import { LANGUAGE_NAMES, type LanguageCode } from '@repo/schemas';

/**
 * Pure display helpers shared by the console hook and its view parts.
 * No data-layer imports — safe to use from `*.view.tsx` and `parts/*`.
 */

/** `en-IN` → `EN`; others → the native script half of LANGUAGE_NAMES ("हिन्दी"). */
export function shortLanguageName(code: LanguageCode): string {
  if (code === 'en-IN') return 'EN';
  const native = LANGUAGE_NAMES[code].split(' — ')[1];
  return native ?? LANGUAGE_NAMES[code];
}

/** Provenance/captured-field keys → chip text: `symptoms.0` → "symptom". */
export function fieldKeyLabel(key: string): string {
  const base = key.split('.')[0] ?? key;
  const labels: Record<string, string> = {
    chiefComplaint: 'chief complaint',
    symptoms: 'symptom',
    history: 'history',
    medications: 'medication',
    allergies: 'allergy',
    redFlags: 'red flag',
    additionalNotes: 'notes',
    vitals: 'vitals',
  };
  return labels[base] ?? base;
}

/** ISO timestamp → local "HH:MM" for the EHR source lines. */
export function formatTimeHHMM(iso: string): string {
  const date = new Date(iso);
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Milliseconds → "mm:ss" for the elapsed ticker (minutes keep counting past 59). */
export function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

/** "Kamla Devi" → "KD"; single names fall back to their first two letters. */
export function initialsOf(name: string): string {
  const [first = '', ...rest] = name.trim().split(/\s+/).filter(Boolean);
  if (!first) return '?';
  const last = rest.at(-1);
  return (last ? `${first.charAt(0)}${last.charAt(0)}` : first.slice(0, 2)).toUpperCase();
}
