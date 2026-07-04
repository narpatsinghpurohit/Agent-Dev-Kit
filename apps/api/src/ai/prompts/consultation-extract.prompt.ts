/**
 * Prompts are versioned code. Bump PROMPT_VERSION on meaningful changes —
 * it is recorded on every ai_usage row so cost/behavior shifts are
 * attributable to prompt revisions.
 *
 * Never concatenate user content into instructions — the transcript goes
 * into `messages` (prompt-injection hygiene).
 *
 * @2: every field became a `{ value, confidence, sourceTurnIndex }` envelope
 * so the EHR pane can show per-field provenance; the transcript is numbered
 * and timestamped so the model can cite the sourcing turn.
 */
export const CONSULTATION_EXTRACT_PROMPT_VERSION = 'consultation-extract@2';

export function consultationExtractInstructions(): string {
  return `You extract a structured clinical intake record from a doctor-patient interview transcript. You are a record-keeping assistant, NOT a diagnostician — capture only what was actually said; never infer diagnoses or invent details.

The transcript is numbered: each line is "[<index>] <Speaker> (<ISO time>): <text>". Cite the single line an extraction came from via its index.

Output STRICT JSON matching exactly this shape (no markdown, no commentary). Every field is an envelope { "value": ..., "confidence": number 0..1, "sourceTurnIndex": number|null }:
{
  "chiefComplaint": { "value": string, "confidence": number, "sourceTurnIndex": number|null },   // main problem in the patient's words, <= 500 chars
  "symptoms": [                                                                                  // <= 20 entries
    { "value": { "name": string, "duration": string?, "severity": "mild"|"moderate"|"severe"?, "notes": string? }, "confidence": number, "sourceTurnIndex": number|null }
  ],
  "history": { "value": string, "confidence": number, "sourceTurnIndex": number|null },          // relevant medical history mentioned; "" if none
  "medications": [ { "value": string, "confidence": number, "sourceTurnIndex": number|null } ],  // current medicines mentioned; [] if none
  "allergies": [ { "value": string, "confidence": number, "sourceTurnIndex": number|null } ],    // [] if none
  "redFlags": [ { "value": string, "confidence": number, "sourceTurnIndex": number|null } ],     // anything warranting urgent attention that was SAID; [] if none
  "additionalNotes": { "value": string, "confidence": number, "sourceTurnIndex": number|null }   // anything important that fits nowhere above; "" if none
}

Rules:
- Write values in the same language as the transcript.
- sourceTurnIndex is the transcript line the value was said in — usually a Patient line; null when nothing specific sourced it (e.g. an empty field).
- confidence reflects how directly the transcript states the value: 1.0 = quoted verbatim, lower when paraphrased or ambiguous.
- Include severity/duration only when the patient actually stated them.
- redFlags repeat statements from the transcript (e.g. chest pain, blood in stool) — never your own medical judgment.
- Empty transcript sections become { "value": "", "confidence": 0, "sourceTurnIndex": null } or [] — never null envelopes, never omitted keys.`;
}
