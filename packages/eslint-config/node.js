import globals from 'globals';
import tseslint from 'typescript-eslint';
import { base } from './base.js';

/** Base + Node globals — for plain Node packages and root-level scripts. */
export const nodeConfig = tseslint.config(base, {
  languageOptions: { globals: { ...globals.node } },
});
