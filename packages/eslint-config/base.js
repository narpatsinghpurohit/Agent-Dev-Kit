import comments from '@eslint-community/eslint-plugin-eslint-comments/configs';
import eslint from '@eslint/js';
import prettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

/**
 * Base flat config for every workspace package.
 * Type errors are tsc's job (`check-types`); lint stays fast and untyped.
 */
export const base = tseslint.config(
  {
    ignores: ['dist/**', 'coverage/**', 'node_modules/**', '.turbo/**'],
  },
  eslint.configs.recommended,
  tseslint.configs.recommended,
  comments.recommended,
  {
    rules: {
      // Agents copy whatever escape hatch they see — a disable without a
      // reason is how the mechanical wall erodes.
      '@eslint-community/eslint-comments/require-description': 'error',
      '@eslint-community/eslint-comments/no-unused-disable': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },
  prettier,
);
