# Testing

A feature is not done without tests. The runner is Vitest 4 everywhere (plus Playwright for
browser e2e), and every layer has exactly one testing style — copy the canonical example for
your layer instead of inventing a new harness.

## Must

- **Test each layer in its own style:**

  | Layer           | Style                                                                   | Canonical example                                               |
  | --------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------- |
  | `@repo/schemas` | Colocated `*.test.ts` parse/reject tests                                | `packages/schemas/src/tasks.test.ts`                            |
  | API unit        | `src/**/*.spec.ts`, `Test.createTestingModule` with mocked repositories | `apps/api/src/auth/auth.service.spec.ts`                        |
  | API e2e         | `test/*.e2e-spec.ts`, real app on in-memory Mongo + supertest           | `apps/api/test/tasks.e2e-spec.ts`, `ai.e2e-spec.ts`             |
  | Web view        | Pure props in, DOM out — no MSW, no hook mocking                        | `apps/web/src/features/tasks/task-list/task-list.view.test.tsx` |
  | Web hook        | `renderHookWithProviders` + orval MSW handlers, explicit fixtures       | `apps/web/src/features/tasks/task-list/task-list.hook.test.ts`  |
  | Full stack      | Playwright against the real built app + real API, keyless               | `apps/web/e2e/app.spec.ts`                                      |

- **Schemas: assert the contract, including what's absent.** `tasks.test.ts` checks parses,
  rejections (`rejects past dueDate on create`), and wire-safety:
  `expect(Object.keys(TaskSchema.shape)).not.toContain('ownerId')`.
- **API unit: mock the repositories, test the service logic.** `auth.service.spec.ts` builds
  the service via `Test.createTestingModule({ providers: [AuthService, { provide: SessionsRepository, useValue: sessions }, ...] })`
  with `vi.fn()` repos, and pins the subtle security behavior by name:
  `it('allows a just-consumed (grace window) token — multi-tab race', ...)` and
  `it('revokes the whole family on reuse outside the grace window', ...)`.
- **API e2e: boot the real thing.** `apps/api/test/create-test-app.ts` imports the real
  `AppModule` + `configureApp` (global guards, pipes, filters, helmet, cookies) against a
  per-suite database on the `MongoMemoryReplSet` from `test/global-setup.ts`, with
  `AI_PROVIDER_MODE=mock`. Config: `apps/api/vitest.config.e2e.ts`; run with
  `pnpm --filter @repo/api test:e2e`.
- **Web views: mock props, nothing else.** The hook/view split exists so view tests are
  trivial — build a props object with `vi.fn()` callbacks and assert DOM + callback calls
  (`task-list.view.test.tsx`). Views need `renderWithProviders` only because `<Link>` reads
  router context; the props stay plain data.
- **Web hooks: real HTTP boundary via the generated MSW handlers.** From
  `task-list.hook.test.ts`:

  ```ts
  import { getTasksListMockHandler } from '@repo/api-client/mocks';
  ...
  const server = setupServer(getTasksListMockHandler(page1));
  ```

  `page1` is an **explicit fixture** (stable ids, titles, dates) — assertions read like the
  data. Pass a response to the handler; never rely on the handler's default faker output for
  assertions, and never hand-write a `fetch` mock. `server.listen({ onUnhandledRequest: 'error' })`
  catches any request your fixture didn't anticipate.

- **Await the render helpers.** `renderWithProviders` / `renderHookWithProviders`
  (`apps/web/src/shared/testing/test-utils.tsx`) are **async** — they `await router.load()`
  before rendering "so the first paint is real". Forgetting the `await` yields an empty root
  route and baffling `getByText` failures. Each call creates a fresh `QueryClient`
  (no retries, no cache bleed between tests).
- **Playwright runs the whole stack keyless.** `apps/web/e2e/start-api.mjs` boots the built
  API on a `MongoMemoryReplSet` with `AI_PROVIDER_MODE=mock`; the `webServer` entries in
  `playwright.config.ts` start it plus `vite preview`. `app.spec.ts` covers signup, task
  CRUD, logout — real browser, real API, zero keys.
- **Test AI through the mock provider, end to end.** `apps/api/test/ai.e2e-spec.ts` asserts
  the SSE protocol headers, persistence, usage rows, and — the crown jewel —
  `it('runs the full tool-approval loop: request → approve → task exists', ...)`: the mock
  model emits a `createTask` tool call, the test verifies no task exists while approval is
  pending, flips the stored part to `approval-responded`, continues the chat, and asserts the
  task genuinely exists via `GET /api/tasks`. Playwright's
  `copilot creates a task after in-chat approval` covers the same loop from the browser.
- **Meet the coverage thresholds** — they gate `pnpm test` per package:

  | Package            | Lines / Functions / Statements | Branches | Config                                 |
  | ------------------ | ------------------------------ | -------- | -------------------------------------- |
  | `@repo/api`        | 80                             | 75       | `apps/api/vitest.config.ts`            |
  | `@repo/schemas`    | 80                             | 75       | `packages/schemas/vitest.config.ts`    |
  | `@repo/api-client` | 80                             | 75       | `packages/api-client/vitest.config.ts` |
  | `@repo/web`        | 60                             | 55       | `apps/web/vitest.config.ts`            |

  Thresholds live in each package's vitest config `coverage.thresholds` — change them there,
  deliberately, not by excluding files.

## Must not

- Never hand-write `fetch` mocks or `vi.mock` the generated hooks — use the orval MSW
  handlers from `@repo/api-client/mocks`; they stay in lockstep with the OpenAPI contract.
- Never assert against unseeded faker output — pass explicit fixtures to `get*MockHandler(...)`
  so tests are deterministic and readable.
- Never mock the ViewModel hook to test a view (pass props) or shallow-test a hook by
  stubbing Query internals (let MSW answer at the HTTP boundary).
- Never skip the `await` on `renderWithProviders` / `renderHookWithProviders`.
- Never point tests at a real database or a real AI provider — API e2e uses
  `MongoMemoryReplSet`; AI tests use `AI_PROVIDER_MODE=mock`. CI must stay keyless.
- Never test the generated client's internals (`src/generated/**`) — it's generated; test
  the runtime pieces (`auth-fetch.test.ts` covers the 401 single-flight refresh).

## Canonical example in this repo

The task-list pair shows the payoff of the hook/view split:

- `task-list.view.test.tsx` — `makeProps()` with `vi.fn()` callbacks, then
  `await renderWithProviders(<TaskListView {...props} />)` and plain DOM assertions
  ("renders tasks with status badges", "fires the filter callback").
- `task-list.hook.test.ts` — `setupServer(getTasksListMockHandler(page1))`,
  `configureApiClient` with a test token, then
  `await renderHookWithProviders(() => useTaskList(undefined))` and
  `waitFor(() => expect(result.current.isLoading).toBe(false))`; a second test overrides the
  handler to capture the `status` query param the hook sends.

Commands: `pnpm test` (all unit, root), `pnpm test:e2e` (API supertest + web Playwright),
`pnpm --filter @repo/<name> test` for one package.

## Where to look

- Hook/view/container split that makes this possible: docs/guidelines/component-structure.md
- MSW handlers and client regeneration: docs/guidelines/api-design.md
- Mock provider details and AI streaming: docs/guidelines/ai.md
- Auth/session semantics the tests pin down: docs/guidelines/security.md
- Test helpers: `apps/web/src/shared/testing/test-utils.tsx`, `apps/api/test/create-test-app.ts`
