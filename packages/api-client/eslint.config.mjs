import { browserConfig } from '@repo/eslint-config/browser';

export default [
  // Generated code is regenerated, never linted or hand-edited.
  { ignores: ['src/generated/**'] },
  ...browserConfig,
];
