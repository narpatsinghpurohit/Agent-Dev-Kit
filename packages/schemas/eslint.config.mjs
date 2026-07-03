import { nodeConfig } from '@repo/eslint-config/node';

export default [
  ...nodeConfig,
  {
    files: ['src/**/*.ts'],
    ignores: ['src/**/*.test.ts'],
    rules: {
      // Platform-neutral package: no React, no Node APIs, no I/O — zod only.
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['node:*', 'react', 'react-dom', '@nestjs/*', 'mongoose'],
              message: '@repo/schemas is the pure domain contract — zod only, no platform imports.',
            },
          ],
        },
      ],
    },
  },
];
