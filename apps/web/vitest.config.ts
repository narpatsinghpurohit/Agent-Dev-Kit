import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'happy-dom',
    // Globals let @testing-library/react auto-register its afterEach cleanup.
    globals: true,
    setupFiles: ['./src/shared/testing/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      include: ['src/features/**', 'src/lib/**'],
      exclude: ['src/**/*.test.*'],
      thresholds: { lines: 60, functions: 60, branches: 55, statements: 60 },
    },
  },
});
