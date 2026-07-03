import globals from 'globals';
import { base } from './base.js';

export default [
  // Fixtures intentionally violate rules; the tests lint them, `pnpm lint` must not.
  { ignores: ['test/fixtures/**'] },
  ...base,
  {
    languageOptions: { globals: { ...globals.node } },
  },
];
