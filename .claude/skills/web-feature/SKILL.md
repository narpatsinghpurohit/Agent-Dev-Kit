---
name: web-feature
description: Adds a web screen as a pure-config route plus a hook/view/container triple with barrel export and tests. Use when building or extending UI in apps/web.
argument-hint: <feature-name>
---

Stateful screens are a lint-enforced triple; routes are pure config. The tasks
feature is the template. Detail: docs/guidelines/component-structure.md.

## Steps

1. **Route file** in `apps/web/src/routes/` (under `_authenticated/` for
   logged-in screens). Read
   `apps/web/src/routes/_authenticated/tasks/index.tsx` as the canonical
   template — it is PURE CONFIG:
   - `validateSearch` with a zod schema for typed search params.
   - `loaderDeps` + `loader` calling `context.queryClient.ensureQueryData(...)`
     with the SAME generated queryOptions the feature hook uses (e.g.
     `getTasksListQueryOptions(...)` from `@repo/api-client`) — one cache
     entry, no double fetch.
   - A tiny component that reads route state and renders the feature page.
     No business logic, no JSX beyond mounting the page.

2. **Route tree regenerates itself.** NEVER edit
   `apps/web/src/routeTree.gen.ts`. It regenerates during `vite dev` or via
   `pnpm --filter @repo/web routes:generate`.

3. **Feature triple** in `apps/web/src/features/<feature>/<screen>/`, modeled
   on `apps/web/src/features/tasks/task-list/`:
   - `<screen>.hook.ts` — the ViewModel. ALL data fetching, mutations, form
     state, and navigation live here; it returns ONE typed object (see
     `useTaskList` returning `TaskListViewModel`). Hook files are `.ts` —
     JSX in them is a parse error.
   - `<screen>.view.tsx` — pure props → JSX. Receives the ViewModel, renders,
     calls its callbacks. No queries, no router, no side effects.
   - `<screen>.tsx` — the ~5-line container binding hook to view.

4. **Respect the lint wall.** `@tanstack/react-query` and `@repo/api-client`
   are importable ONLY in `src/**/*.hook.ts`, `src/routes/**`, `src/main.tsx`,
   `src/lib/**`, `src/shared/testing/**`, and `*.test` files (the
   "webArchitecture" rules in `packages/eslint-config/react.js`). If eslint
   rejects an import, the fix is MOVING the code into the hook (or a
   `.hook.ts` helper like `apps/web/src/features/tasks/tasks-cache.hook.ts`)
   — never `eslint-disable`. `react-router-dom` is banned everywhere; this
   app uses `@tanstack/react-router`.

5. **Barrel export.** The feature `index.ts` exports pages ONLY, like
   `apps/web/src/features/tasks/index.ts`:

   ```ts
   export { TaskListPage } from './task-list/task-list';
   ```

   Internals (hooks, views, components) stay feature-private. Presentational
   leaves (e.g. `features/tasks/components/task-status-badge.tsx`) stay
   single-file — no triple needed when there is no state.

6. **Tests.**
   - Hook test modeled on
     `apps/web/src/features/tasks/task-list/task-list.hook.test.ts`: MSW
     server from orval handlers (`getTasksListMockHandler(fixture)` from
     `@repo/api-client/mocks`) with explicit fixtures — never hand-written
     fetch mocks.
   - View test modeled on `task-list.view.test.tsx`: feed a fake ViewModel,
     assert rendering and callbacks.
   - `renderWithProviders` / `renderHookWithProviders` from
     `apps/web/src/shared/testing/test-utils.tsx` are ASYNC — `await` them.
   - Run `pnpm --filter @repo/web test`.

7. **Verify**: `pnpm --filter @repo/web lint && pnpm --filter @repo/web check-types`.
   If the screen is part of a core journey, extend `apps/web/e2e/app.spec.ts`
   (Playwright against the real keyless API).
