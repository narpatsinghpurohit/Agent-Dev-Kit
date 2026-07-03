// FIXTURE: must PASS lint — the AI module is the one home for provider imports.
import { google } from '@ai-sdk/google';

export function registryModel() {
  return google('gemini-3.5-flash');
}
