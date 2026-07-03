import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    coverage: {
      // Vitest 4: include must be explicit or numbers silently inflate.
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts'],
      thresholds: { lines: 80, functions: 80, branches: 75, statements: 80 },
    },
  },
});
