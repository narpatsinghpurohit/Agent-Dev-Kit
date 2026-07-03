// FIXTURE: must FAIL lint — feature code importing an AI provider directly.
import { google } from '@ai-sdk/google';

export function badDirectModel() {
  return google('gemini-3.5-flash');
}
