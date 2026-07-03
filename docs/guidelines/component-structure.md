# Component structure: the view/hook standard

Every stateful screen in `apps/web` is a **triple** — ViewModel hook, pure
view, ~5-line container. This is not a style preference: the data layer is
physically unimportable outside hook files and routes (ESLint
`no-restricted-imports`), so putting a query in a component is a lint
**error**, not a review comment.

## The triple

| File              | Role                                                                                                                                                                                            |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `<name>.hook.ts`  | The ViewModel. ALL server data, mutations, form state, and navigation live here. Returns **one typed object**. Always `.ts` — JSX in a ViewModel is banned (and would be a parse error anyway). |
| `<name>.view.tsx` | Pure props → JSX. Receives the ViewModel object; renders it; owns zero data access.                                                                                                             |
| `<name>.tsx`      | The container. Calls the hook, spreads the result into the view. ~5 lines, no logic.                                                                                                            |

The container, verbatim — `apps/web/src/features/tasks/task-list/task-list.tsx`:

```tsx
import type { TaskStatus } from '@repo/schemas';
import { useTaskList } from './task-list.hook';
import { TaskListView } from './task-list.view';

/** ~5-line container: the modern Container/Presentational split. */
export function TaskListPage({ statusFilter }: { statusFilter?: TaskStatus }) {
  const viewModel = useTaskList(statusFilter);
  return <TaskListView {...viewModel} />;
}
```

The hook exports its return type so the view's props need no duplication —
from `task-list.hook.ts`:

```ts
export type TaskListViewModel = ReturnType<typeof useTaskList>;
```

and the view consumes exactly that: `export function TaskListView({ ... }: TaskListViewModel)`.

## The granularity rule

- Splitting is **mandatory** the moment a component needs **server data, form
  state, or navigation** — and mechanically so, because `@tanstack/react-query`
  and `@repo/api-client` cannot be imported anywhere else (see enforcement below).
- **Presentational leaves stay single-file.** No triple for a component that
  only renders props — `features/tasks/components/task-status-badge.tsx`:

  ```tsx
  /** Pure presentational leaf — single file by the standard, no split. */
  export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  ```

- **Never wrap a lone `useState`.** A local toggle or input inside a
  presentational component does not justify a `.hook.ts` — the split earns its
  weight only when the data layer is involved.

## Must

- Return a single object from the hook and export `XyzViewModel = ReturnType<typeof useXyz>`.
- Keep navigation (`useNavigate`), mutations, cache invalidation, and form state
  in the hook; the view fires callbacks it received as props.
- Share cross-screen cache logic via a hook file too — `features/tasks/tasks-cache.hook.ts`
  (`useInvalidateTasks`) is imported by all three task ViewModels.
- Keep routes pure config (below) and prefetch with the **same** generated
  `queryOptions` the hook uses, so loader and hook share one cache entry.
- Export **pages only** from feature barrels — `features/tasks/index.ts`, verbatim:

  ```ts
  // Feature barrel: pages only — internals stay feature-private.
  export { TaskListPage } from './task-list/task-list';
  export { TaskDetailPage } from './task-detail/task-detail';
  export { TaskCreatePage } from './task-form/task-form';
  ```

## Must not

- No `useQuery`/`useMutation`/`useChat`/`@repo/api-client` imports in `.view.tsx`,
  `.tsx` containers, or single-file components (lint error).
- No JSX in `.hook.ts`, and no `.hook.tsx` files (a dedicated lint rule rejects
  the extension outright).
- No business logic in containers or route components — they wire, nothing more.
- No barrel exports of hooks, views, or internal components; reach into a
  feature only through its page exports.
- No hand-written fetch mocks in tests (see testing payoff below).

## Routes are pure config

Route files under `src/routes/` declare typed search params and a loader; the
component render is one line. `apps/web/src/routes/_authenticated/tasks/index.tsx`:

```tsx
export const Route = createFileRoute('/_authenticated/tasks/')({
  validateSearch: searchSchema,
  loaderDeps: ({ search }) => ({ status: search.status }),
  loader: ({ context, deps }) =>
    context.queryClient.ensureQueryData(
      getTasksListQueryOptions({ status: deps.status, limit: 20 }),
    ),
  component: TasksIndexRoute,
});
```

`getTasksListQueryOptions` is the same generated helper the hook's query uses —
one cache entry, no double fetch. The payoff shows in
`task-detail/task-detail.hook.ts`: "The route loader already ensured this
query, so the suspense hook renders synchronously from cache on first paint"
(`useTasksGetSuspense`). Auth gating lives in the pathless layout route
`src/routes/_authenticated.tsx` (`beforeLoad` + `redirect`); route files never
own UI state.

## Feature folder anatomy (`features/tasks`, real files)

```
apps/web/src/features/tasks/
  index.ts                       # barrel: pages only
  tasks-cache.hook.ts            # shared invalidation helper (data layer ⇒ hook file)
  components/
    task-status-badge.tsx        # presentational leaf, single file
  lib/
    format.ts                    # pure helpers (STATUS_LABEL, formatDueDate, nextStatus)
    format.test.ts
  task-list/
    task-list.hook.ts            # ViewModel: infinite query + mutations + filter nav
    task-list.hook.test.ts       # MSW-backed hook test
    task-list.view.tsx           # pure props → JSX
    task-list.view.test.tsx      # mock-props view test
    task-list.tsx                # container
  task-detail/
    task-detail.hook.ts / task-detail.view.tsx / task-detail.tsx
  task-form/
    task-form.hook.ts / task-form.view.tsx / task-form.tsx
```

## Enforcement: ban-then-unban

`packages/eslint-config/react.js` bans the data layer in **all** of `src/`,
then re-allows it only in the files that are supposed to own data. Flat config
resolves same-rule conflicts by "last match wins", so the allow object must
stay after the ban object (fixture tests in
`packages/eslint-config/test/web-architecture.test.ts` guard this). The actual
globs:

```js
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
  ...
}
```

Two teaching backstops sit behind the import bans: `repo/web-arch/pure-views`
flags any `use(Query|…|Mutation|…|Chat)` call inside a `*.view.tsx`, and
`repo/web-arch/hook-files-are-ts` rejects `*.hook.tsx` files entirely.
`apps/web/eslint.config.mjs` applies all of this via `...webArchitecture`.

## Testing payoff

The split is what makes both halves cheaply testable
(details and helpers: [testing.md](./testing.md)):

- **Hook tests** exercise real data flow: `renderHookWithProviders` (async —
  **await it**) plus the orval-generated MSW handlers with explicit fixtures.
  From `task-list.hook.test.ts`:

  ```ts
  const server = setupServer(getTasksListMockHandler(page1));
  // ...
  const { result } = await renderHookWithProviders(() => useTaskList(undefined));
  await waitFor(() => expect(result.current.isLoading).toBe(false));
  expect(result.current.tasks.map((t) => t.title)).toEqual(['First task', 'Second task']);
  ```

- **View tests** are pure props in, DOM out — `vi.fn()` callbacks, no MSW, no
  hook mocking. From `task-list.view.test.tsx`: "View tests are the payoff of
  the split: pure props in, DOM out. No providers, no MSW, no mocking of
  hooks." (Views still render via `renderWithProviders` only because `<Link>`
  reads router context.)

## Where to look

- `packages/eslint-config/react.js` — the full webArchitecture rule set and ban messages.
- `apps/web/src/features/tasks/**` — the reference feature; copy its shape.
- `apps/web/src/routes/_authenticated/tasks/*.tsx` — reference routes (search validation, loaders, params).
- `apps/web/src/shared/testing/test-utils.tsx` — `renderWithProviders` / `renderHookWithProviders`.
- Query/form/cache specifics: [data-and-state.md](./data-and-state.md). Test strategy: [testing.md](./testing.md).
