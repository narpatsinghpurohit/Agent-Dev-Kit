import eslintReact from '@eslint-react/eslint-plugin';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import { base } from './base.js';

export const reactConfig = tseslint.config(
  base,
  eslintReact.configs['recommended-typescript'],
  reactHooks.configs.flat.recommended,
  {
    languageOptions: { globals: { ...globals.browser } },
    // "JSX only in .tsx" needs no lint rule: the TS parser rejects JSX in
    // .ts files, and the hook-files-are-ts tripwire below rejects *.hook.tsx.
  },
);

const BANNED_EVERYWHERE = [
  {
    name: 'react-router-dom',
    message:
      'This repo uses TanStack Router (@tanstack/react-router). See docs/guidelines/data-and-state.md.',
  },
  {
    name: '@ai-sdk/google',
    message:
      'AI providers are server-side only — the web app talks to the NestJS API. See docs/guidelines/ai.md.',
  },
  {
    name: '@ai-sdk/amazon-bedrock',
    message:
      'AI providers are server-side only — the web app talks to the NestJS API. See docs/guidelines/ai.md.',
  },
];

const DATA_LAYER = [
  {
    name: '@tanstack/react-query',
    message:
      'Server state belongs in *.hook.ts files or route loaders — views receive props. See docs/guidelines/component-structure.md.',
  },
  {
    name: '@repo/api-client',
    message:
      'The API client may only be imported from *.hook.ts files or route loaders. See docs/guidelines/component-structure.md.',
  },
];

/**
 * The view/hook file standard, mechanically enforced (ban-then-unban).
 *
 * ORDER MATTERS: flat config resolves same-rule conflicts by "last match
 * wins", so the allow-list objects below MUST stay after the ban object.
 * The fixture tests in test/web-architecture.test.ts fail if this breaks.
 */
export const webArchitecture = [
  {
    name: 'repo/web-arch/ban-data-layer',
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', { paths: [...BANNED_EVERYWHERE, ...DATA_LAYER] }],
    },
  },
  {
    // The ONLY homes for data access: ViewModel hooks, route loaders, app
    // wiring, and tests. Everything else gets data via props.
    name: 'repo/web-arch/allow-data-layer-in-hooks',
    files: [
      'src/**/*.hook.ts',
      'src/routes/**/*.{ts,tsx}',
      'src/main.tsx',
      'src/lib/**/*.{ts,tsx}',
      'src/shared/testing/**/*.{ts,tsx}',
      'src/**/*.test.{ts,tsx}',
    ],
    rules: {
      'no-restricted-imports': ['error', { paths: BANNED_EVERYWHERE }],
    },
  },
  {
    // Teaching backstop — import bans are the load-bearing enforcement.
    name: 'repo/web-arch/pure-views',
    files: ['src/**/*.view.tsx'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            'CallExpression[callee.name=/^use(Query|Queries|InfiniteQuery|SuspenseQuery|SuspenseQueries|SuspenseInfiniteQuery|Mutation|MutationState|QueryClient|Chat)$/]',
          message:
            'Views are pure props → JSX. Move data access into the sibling *.hook.ts (docs/guidelines/component-structure.md).',
        },
      ],
    },
  },
  {
    name: 'repo/web-arch/hook-files-are-ts',
    files: ['src/**/*.hook.tsx'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Program',
          message:
            'Hook files must use the .ts extension (no JSX in ViewModels). Rename to *.hook.ts and move JSX into the *.view.tsx.',
        },
      ],
    },
  },
];
