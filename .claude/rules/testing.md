---
paths: ['**/*.test.*', '**/*.spec.*', '**/e2e/**']
---

Vitest 4 everywhere. api unit = `src/**/*.spec.ts` (`pnpm --filter @repo/api test`); api e2e = `test/*.e2e-spec.ts` on MongoMemoryReplSet (`test:e2e`, vitest.config.e2e.ts); web unit = `src/**/*.test.{ts,tsx}`; web e2e = Playwright in `apps/web/e2e/`.
Web API mocking: ONLY the orval-generated MSW handlers from `@repo/api-client/mocks` (e.g. `getPatientsListMockHandler(fixture)`) — never hand-written fetch mocks.
`renderWithProviders`/`renderHookWithProviders` (apps/web/src/shared/testing/test-utils.tsx) are ASYNC — always `await` them.
Copy the nearest real spec as your template; coverage thresholds live in each package's vitest config.
Detail: docs/guidelines/testing.md
