import globals from 'globals';
import tseslint from 'typescript-eslint';
import { base } from './base.js';

/** Base + browser globals — for non-React browser-targeted packages. */
export const browserConfig = tseslint.config(base, {
  languageOptions: { globals: { ...globals.browser } },
});
