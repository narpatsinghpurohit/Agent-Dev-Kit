# Data & State

Two kinds of state, two owners. **Server state** (anything fetched from the API) belongs to
TanStack Query, accessed exclusively through the orval-generated hooks in `@repo/api-client`.
**Client state** (UI-only concerns) climbs a deliberate ladder: URL search params → local
`useState` → module store. Nothing in between, and never both owning the same fact.

All of this lives inside the hook/view/container triple — data code goes in `*.hook.ts` files
(detail: docs/guidelines/component-structure.md).

## Must

- **Fetch server state only through generated hooks** from `@repo/api-client`
  (`useTasksList`, `useTasksListInfinite`, `useTasksCreate`, …) or their generated
  `get*QueryOptions` helpers. They carry the query keys, types, and the auth-aware fetcher.
- **Keep the `QueryClient` in router context.** It is created once in `apps/web/src/main.tsx`
  and typed in `apps/web/src/routes/__root.tsx`:

  ```ts
  export interface RouterContext {
    queryClient: QueryClient;
    auth: AuthStore;
  }
  ```

- **Prefetch in loaders with the SAME generated `queryOptions` the feature hook uses.**
  One cache entry, no double fetch. `apps/web/src/routes/_authenticated/tasks/index.tsx`:

  ```ts
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

- **Invalidate by URL-prefix predicate after mutations.** Generated query keys start with the
  endpoint URL; infinite query keys are `['infinite', <url>, ...]` while plain ones are
  `[<url>, ...]` — a predicate covers every filter, cursor, and detail variant at once.
  Use `useInvalidateTasks` (`apps/web/src/features/tasks/tasks-cache.hook.ts`):

  ```ts
  await queryClient.invalidateQueries({
    // Infinite query keys are ['infinite', <url>, ...]; plain ones [<url>, ...].
    predicate: (query) =>
      query.queryKey.some((part) => typeof part === 'string' && part.startsWith(base)),
  });
  ```

  Wire it as `useTasksUpdate({ mutation: { onSuccess: invalidate } })` (see
  `task-list.hook.ts`) or `await invalidate()` after `mutateAsync`.

- **Climb the client-state ladder in order:**
  1. **URL search params** for anything shareable/bookmarkable — `validateSearch` with a zod
     schema on the route, navigate to change it (the task list status filter:
     `navigate({ to: '/tasks', search: status ? { status } : {} })`).
  2. **Local `useState`** inside a `.hook.ts` for transient UI state (e.g. `serverError` in
     `task-form.hook.ts`, `isRecording` in `copilot-panel.hook.ts`).
  3. **Module store + `useSyncExternalStore`** only for true app-wide state. The single
     example is auth (`apps/web/src/lib/auth.ts`): a module-scope variable, a `listeners`
     set, and an `authStore = { getState, subscribe }` object consumed via
     `useSyncExternalStore(authStore.subscribe, authStore.getState)` in `app-shell.hook.ts`.
- **Validate forms with the SAME `@repo/schemas` zod schema the API enforces.** TanStack Form
  lives in the `.hook.ts`; the schema runs before the mutation.
  `apps/web/src/features/tasks/task-form/task-form.hook.ts`:

  ```ts
  const parsed = TaskCreateSchema.safeParse(payload);
  if (!parsed.success) {
    setServerError(parsed.error.issues[0]?.message ?? 'Invalid input');
    return;
  }
  ...
  const created = await createMutation.mutateAsync({ data: parsed.data });
  await invalidate();
  ```

  Users see identical rules before and after the network.

- **Derive, don't store.** Flatten/compute from query data in the hook on every render
  (`query.data?.pages.flatMap((page) => page.items) ?? []` in `task-list.hook.ts`).

## Must not

- **Never hand-write fetch/axios calls or query keys** for API data. If an endpoint has no
  hook, regenerate the client (`pnpm gen:client`) — detail: docs/guidelines/api-design.md.
- **Never copy server data into `useState`/stores.** No `useEffect(() => setTasks(data))`.
  The Query cache is the single source of truth; a copy goes stale the moment a mutation
  lands elsewhere (including from the AI copilot's tools).
- **Never import `@tanstack/react-query` or `@repo/api-client` outside the allowed zones**
  (`*.hook.ts`, `src/routes/**`, `src/main.tsx`, `src/lib/**`, `src/shared/testing/**`,
  tests) — lint-enforced; detail: docs/guidelines/component-structure.md.
- **Never use `react-router-dom`** — this app uses TanStack Router; the import is banned by
  lint (stale-training trap).
- **Never hand-roll `queryOptions` in a loader** that a hook fetches with different options —
  that creates two cache entries and a double fetch. Import the generated
  `get*QueryOptions` in both places.
- **Never reach for a global store for data that belongs to one screen** (use the URL or
  `useState`) or to the server (use Query). `lib/auth.ts` earns its store because the access
  token must live in module scope (never localStorage) and every screen reacts to it.
- **Never hand-edit `src/routeTree.gen.ts` or `packages/api-client/src/generated/**`** —
  both are generated and drift-checked.

## Canonical example in this repo

The tasks list flow, end to end:

- `apps/web/src/routes/_authenticated/tasks/index.tsx` — `validateSearch` (zod enum for
  `status`), `loaderDeps`, and `ensureQueryData(getTasksListQueryOptions(...))`.
- `apps/web/src/features/tasks/task-list/task-list.hook.ts` — the ViewModel: the SAME
  endpoint via `useTasksListInfinite({ status: statusFilter, limit: PAGE_SIZE })`, mutations
  with `onSuccess: invalidate`, filter changes written back to the URL via `navigate`.
- `apps/web/src/features/tasks/tasks-cache.hook.ts` — the prefix-predicate invalidation.
- `apps/web/src/features/tasks/task-form/task-form.hook.ts` — TanStack Form +
  `TaskCreateSchema.safeParse` + generated mutations.
- `apps/web/src/lib/auth.ts` — the module store: `let accessToken`, `let state`,
  `authStore.subscribe`, `bootstrapAuth()` running one silent refresh before the router
  mounts.

## Where to look

- Hook/view/container triple and import zones: docs/guidelines/component-structure.md
- Generated client, regeneration chain, auth fetcher: docs/guidelines/api-design.md
- Zod contract package (`@repo/schemas`, rebuild after changes): docs/guidelines/architecture.md
- Auth/token design rationale: docs/guidelines/security.md
- Testing hooks with MSW handlers: docs/guidelines/testing.md
