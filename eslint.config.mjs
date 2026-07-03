import { nodeConfig } from '@repo/eslint-config/node';

export default [
  // Workspace packages lint themselves with their own nearest config
  // (ESLint 10 resolves config from the linted file upward).
  { ignores: ['apps/**', 'packages/**'] },
  ...nodeConfig,
];
