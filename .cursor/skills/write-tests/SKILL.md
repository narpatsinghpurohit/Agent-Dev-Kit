---
name: write-tests
description: Writes tests for a given path or feature by picking the right layer and copying the matching real spec as a template. Use when adding or fixing tests anywhere in the monorepo.
argument-hint: <path or feature>
---

Vitest 4 everywhere (Playwright for web e2e). Every layer has a real, green
example spec — read it and follow it instead of inventing structure. Detail:
docs/guidelines/testing.md.

## Steps

1. **Decide the layer** from what the code under test is:

   | Code under test                | Layer                          | Canonical example to read                                                      |
   | ------------------------------ | ------------------------------ | ------------------------------------------------------------------------------ |
   | zod schemas                    | schemas unit                   | `packages/schemas/src/medical.test.ts`                                         |
   | Nest service/repo logic        | api unit (`src/**/*.spec.ts`)  | `apps/api/src/auth/auth.service.spec.ts`                                       |
   | pure api helpers               | api unit                       | `apps/api/src/ai/speech/wav.spec.ts`, `apps/api/src/ai/feature-models.spec.ts` |
   | HTTP behavior, auth, ownership | api e2e (`test/*.e2e-spec.ts`) | `apps/api/test/patients.e2e-spec.ts`, `apps/api/test/auth.e2e-spec.ts`         |
   | AI endpoints (keyless mock)    | api e2e                        | `apps/api/test/ai.e2e-spec.ts`, `ai-budget.e2e-spec.ts`                        |
   | web ViewModel hook             | web unit                       | `apps/web/src/features/patients/patient-list/patient-list.hook.test.ts`        |
   | web view component             | web unit                       | `apps/web/src/features/shell/app-shell.view.test.tsx`                          |
   | full user journey              | web e2e (Playwright)           | `apps/web/e2e/app.spec.ts`                                                     |

2. **Read the example spec end to end** before writing yours — naming,
   fixtures, setup/teardown, and assertion style are the standard.

3. **Layer-specific rules:**
   - API unit specs live NEXT TO the source as `*.spec.ts` (decorators work
     via unplugin-swc in `apps/api/vitest.config.ts`).
   - API e2e boots the real app on an in-memory Mongo replica set via
     `apps/api/test/create-test-app.ts`; throttling is skipped in
     NODE_ENV=test. For owned resources, always include the two-user
     cross-access 404 assertion (see `patients.e2e-spec.ts`).
   - Web unit mocks the API ONLY with orval-generated MSW handlers from
     `@repo/api-client/mocks` (e.g. `getPatientsListMockHandler(fixture)`) with
     explicit fixtures — never hand-written fetch mocks, never unseeded
     random data. `renderWithProviders`/`renderHookWithProviders` from
     `apps/web/src/shared/testing/test-utils.tsx` are ASYNC — `await` them.
   - Web e2e runs against the real API, keyless, started by
     `apps/web/e2e/start-api.mjs` (wired in `playwright.config.ts`).

4. **Run the right script** and iterate to green:
   - `pnpm --filter @repo/schemas test`
   - `pnpm --filter @repo/api test` / `pnpm --filter @repo/api test:e2e`
   - `pnpm --filter @repo/web test` / `pnpm --filter @repo/web test:e2e`
     Never weaken an assertion or delete a failing test to get green — fix the
     code or the fixture.

5. **Check coverage.** Thresholds live per package in the vitest configs
   (e.g. `apps/web/vitest.config.ts` covers `src/features/**` and `src/lib/**`).
   If your new code is inside a covered glob, make sure the suite still meets
   the thresholds: run the package's `test` script and read the coverage
   summary.
