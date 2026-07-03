---
name: new-feature
description: Builds a complete vertical slice (zod schemas → Nest module → generated client → web feature triple → tests) using the tasks feature as the template. Use when adding a new domain feature end to end.
argument-hint: <feature-name>
---

Build the feature bottom-up so each layer consumes the one below it. The tasks
feature is the canonical slice — copy its structure, not its content. Detail:
docs/guidelines/architecture.md.

## 1. Domain contract (packages/schemas)

1. Read `packages/schemas/src/tasks.ts` as the canonical template: entity
   schema, Create/Update inputs, list query + `cursorPage(...)` response.
   NEVER put `ownerId` in a wire schema — ownership comes from the JWT.
2. Create `packages/schemas/src/<feature>.ts` and a `<feature>.test.ts`
   modeled on `packages/schemas/src/tasks.test.ts`.
3. Add `export * from './<feature>';` to `packages/schemas/src/index.ts`.
4. @repo/schemas is a COMPILED package — run
   `pnpm --filter @repo/schemas build` (turbo's `^build` also handles it), then
   `pnpm --filter @repo/schemas test`.

## 2. API module (apps/api)

5. Run `/api-endpoint` mentally or literally: mirror `apps/api/src/tasks/*`
   (`task.schema.ts`, `tasks.repository.ts`, `tasks.service.ts`,
   `tasks.controller.ts`, `dto/tasks.dto.ts`, `tasks.module.ts`).
6. Authorization is a query predicate: every repository query filters by
   `ownerId` (see the header comment in `apps/api/src/tasks/tasks.repository.ts`).
   Missing or foreign document → 404, never 403.
7. Register the module in `apps/api/src/app.module.ts` `imports` (next to
   `TasksModule`).

## 3. API tests

8. Unit: model on `apps/api/src/tasks/tasks.service.spec.ts`.
   E2e: model on `apps/api/test/tasks.e2e-spec.ts` (uses
   `test/create-test-app.ts`; includes a cross-user 404 assertion — copy it).
9. `pnpm --filter @repo/api test && pnpm --filter @repo/api test:e2e`.

## 4. Generated client

10. Run `pnpm gen:client` (turbo chain: api build → emit-openapi → orval).
    `packages/api-client/src/generated/**` is COMMITTED and drift-checked —
    commit the regenerated files, never hand-edit them.

## 5. Web feature (apps/web)

11. Run `/web-feature <feature-name>` for the details. In short: route files
    under `apps/web/src/routes/_authenticated/<feature>/` modeled on
    `apps/web/src/routes/_authenticated/tasks/index.tsx` (pure config:
    `validateSearch` + loader `ensureQueryData` with the SAME generated
    queryOptions the hook uses), plus a hook/view/container triple per screen
    modeled on `apps/web/src/features/tasks/task-list/`, plus a pages-only
    barrel like `apps/web/src/features/tasks/index.ts`.
12. Never touch `apps/web/src/routeTree.gen.ts` — it regenerates via
    `pnpm --filter @repo/web routes:generate` (or during `vite dev`).

## 6. Web tests

13. Hook test modeled on
    `apps/web/src/features/tasks/task-list/task-list.hook.test.ts`, view test
    on `task-list.view.test.tsx`. MSW handlers come from
    `@repo/api-client/mocks` only. `pnpm --filter @repo/web test`.

## 7. Definition of Done

14. From the root: `pnpm lint && pnpm check-types && pnpm test`, then
    `pnpm test:e2e` if API or web flows changed. All green, generated files
    committed, no eslint-disable added to dodge the architecture lint.
