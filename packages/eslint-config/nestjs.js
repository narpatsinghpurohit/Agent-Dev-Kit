import globals from 'globals';
import tseslint from 'typescript-eslint';
import { base } from './base.js';

const API_BANS = [
  {
    name: '@nestjs/passport',
    message:
      'This kit uses plain guards + @nestjs/jwt — no passport. See docs/guidelines/security.md.',
  },
  {
    name: 'passport',
    message:
      'This kit uses plain guards + @nestjs/jwt — no passport. See docs/guidelines/security.md.',
  },
  {
    name: 'class-validator',
    message: 'DTOs are zod-first via nestjs-zod createZodDto. See docs/guidelines/api-design.md.',
  },
  {
    name: 'class-transformer',
    message: 'DTOs are zod-first via nestjs-zod. See docs/guidelines/api-design.md.',
  },
];

const AI_PROVIDER_BANS = [
  {
    name: '@ai-sdk/google',
    message:
      'Model access goes through the feature registry (src/ai/model-registry.ts) — never a provider import in feature code. See docs/guidelines/ai.md.',
  },
  {
    name: '@ai-sdk/amazon-bedrock',
    message:
      'Model access goes through the feature registry (src/ai/model-registry.ts) — never a provider import in feature code. See docs/guidelines/ai.md.',
  },
];

const AI_TEST_BAN = [
  {
    name: 'ai/test',
    message:
      "'ai/test' is a test-only entrypoint and crashes at runtime — the keyless demo path is the custom mock provider in src/ai/providers/mock. See docs/guidelines/ai.md.",
  },
];

export const nestjsConfig = tseslint.config(
  base,
  {
    languageOptions: { globals: { ...globals.node } },
    rules: {
      // Nest DI + ZodValidationPipe read classes from emitDecoratorMetadata:
      // constructor/param "type-only" imports are runtime-load-bearing, and
      // auto-fixing them to `import type` silently breaks injection.
      '@typescript-eslint/consistent-type-imports': 'off',
    },
  },
  {
    // Feature code: no direct provider access, no ai/test.
    name: 'repo/api-arch/ai-behind-registry',
    files: ['src/**/*.ts'],
    ignores: ['src/ai/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        { paths: [...API_BANS, ...AI_PROVIDER_BANS, ...AI_TEST_BAN] },
      ],
    },
  },
  {
    // The AI module itself is the one place providers are constructed.
    name: 'repo/api-arch/ai-module',
    files: ['src/ai/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { paths: [...API_BANS, ...AI_TEST_BAN] }],
    },
  },
  {
    // Tests may use ai/test mocks.
    name: 'repo/api-arch/tests',
    files: ['src/**/*.spec.ts', 'test/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { paths: API_BANS }],
    },
  },
  {
    // Scripts (seed, emit-openapi) are operational CLIs — console is their UI.
    name: 'repo/api-arch/scripts',
    files: ['src/scripts/**/*.ts', 'scripts/**/*.ts'],
    rules: {
      'no-console': 'off',
    },
  },
);
