# Naming and style

Conventions that hold across every workspace. Most are lint-enforced by
`packages/eslint-config` — this doc explains the intent so you can predict the
rule you have not hit yet.

## Must

- **kebab-case for every file name**: `task-status-badge.tsx`,
  `one-time-tokens.repository.ts`, `model-registry.service.ts`. The only
  exceptions are TanStack Router's route-file conventions
  (`__root.tsx`, `_authenticated.tsx`, `$taskId.tsx`) and generated files.
- **Role suffixes in the API** (NestJS): `.module.ts`, `.controller.ts`,
  `.service.ts`, `.repository.ts`, `.schema.ts` (Mongoose), `.guard.ts`, and
  `.dto.ts` inside a `dto/` folder. One role per file.
- **Role suffixes on the web mirror them**: `<name>.hook.ts` (ViewModel),
  `<name>.view.tsx` (pure JSX), `<name>.tsx` (container). Hook files are
  `.ts`, never `.tsx` — the standard itself lives in
  [component-structure.md](./component-structure.md).
- **Test suffixes**: `*.spec.ts` for api unit tests (colocated),
  `*.e2e-spec.ts` under `apps/api/test/`, `*.test.ts(x)` in web and packages.
- **Named exports everywhere.** `export default` only where a tool demands it:
  `vite.config.ts`, `playwright.config.ts`, `orval.config.ts`,
  `eslint.config.mjs`. `apps/web/src` contains zero default exports — routes
  export `export const Route`, components export named functions.
- **No `any`** — `@typescript-eslint/no-explicit-any` is an `error` in the
  shared base config.
- **Every eslint-disable carries a reason** — the base config enforces it:

  ```js
  // packages/eslint-config/base.js
  // Agents copy whatever escape hatch they see — a disable without a
  // reason is how the mechanical wall erodes.
  '@eslint-community/eslint-comments/require-description': 'error',
  '@eslint-community/eslint-comments/no-unused-disable': 'error',
  ```

- **Import style**: inline type imports in web and packages
  (`consistent-type-imports` with `fixStyle: 'inline-type-imports'`), e.g.
  `import { Model, type QueryFilter, Types } from 'mongoose'`. In `apps/api`
  that rule is deliberately **off** — Nest DI and the ZodValidationPipe read
  classes from `emitDecoratorMetadata`, so auto-converting a constructor
  parameter's import to `import type` silently breaks injection
  (see the comment in `packages/eslint-config/nestjs.js`).
- **`console` is banned except `warn`/`error`** — API logging goes through
  nestjs-pino; only operational CLIs (`apps/api/src/scripts/**`) may print.
- **Comments explain constraints, not narration.** State the invariant or the
  trap, not what the next line does.

## Must not

- No PascalCase/camelCase/snake_case file names (`TaskList.tsx`, `authUtils.ts`).
- No default-exported React components — breaks grep-ability and invites
  rename-on-import drift.
- No `// eslint-disable-next-line <rule>` without a `-- reason` description.
- No `any`, including `as any`, without a described disable explaining why the
  type system genuinely cannot express it.
- No commented-out code and no narration comments (`// loop over tasks`).
- No utility grab-bags (`utils.ts` at package root) — helpers live next to
  their feature (`features/tasks/lib/format.ts`) or in an app-level `src/lib/`
  module with a real name (`src/lib/auth.ts`).

## Canonical example in this repo

The suffix mirror, side by side:

```
apps/api/src/tasks/                 apps/web/src/features/tasks/task-list/
  tasks.module.ts                     task-list.hook.ts      (ViewModel)
  tasks.controller.ts                 task-list.view.tsx     (pure JSX)
  tasks.service.ts                    task-list.tsx          (container)
  tasks.repository.ts                 task-list.hook.test.ts
  task.schema.ts                      task-list.view.test.tsx
  tasks.service.spec.ts
  dto/tasks.dto.ts
```

A constraint comment doing its job, from `apps/api/src/tasks/tasks.repository.ts`:

```ts
/**
 * Every query includes `ownerId` in the filter — ownership is a query
 * predicate, never a post-fetch check.
 */
```

A described disable doing its job, from `apps/web/src/shared/testing/test-utils.tsx`:

```tsx
{
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any -- the app's Register interface types the real router; tests use a minimal one */
}
<RouterProvider router={router as any} />;
```

## Where to look

- `packages/eslint-config/base.js` — the shared rule set (no-any, disable
  descriptions, inline type imports, no-console).
- `packages/eslint-config/nestjs.js` — API-specific deltas and the
  decorator-metadata exception.
- `packages/eslint-config/react.js` — web architecture enforcement (owned by
  [component-structure.md](./component-structure.md)).
- File-role details for the web triple: [component-structure.md](./component-structure.md).
  API layering: [api-design.md](./api-design.md).
