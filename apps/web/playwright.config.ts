import { defineConfig } from '@playwright/test';

/**
 * Full-stack e2e: the REAL API on an in-memory Mongo replica set (no Docker,
 * no keys — the AI provider is the mock) behind the vite preview proxy.
 * The API must be built first (`turbo` handles that via test:e2e deps).
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: [
    {
      command: 'node e2e/start-api.mjs',
      url: 'http://localhost:3000/api/docs',
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: 'pnpm build && pnpm exec vite preview --port 4173 --strictPort',
      url: 'http://localhost:4173',
      reuseExistingServer: false,
      timeout: 180_000,
    },
  ],
});
