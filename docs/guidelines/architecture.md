# Architecture

Turborepo + pnpm@11.9.0 workspaces (Node >= 22.12). Two apps, four packages,
one wire contract. Dependency versions live **only** in the `catalog:` section
of `pnpm-workspace.yaml`; `pnpm syncpack:lint` fails CI if a package pins its
own diverging version.

## Monorepo map

| Workspace                                  | What it is                                                                                                                             |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web` (`@repo/web`)                   | Vite 8 + React 19 SPA — TanStack Router (file routes) / Query / Form, Tailwind v4                                                      |
| `apps/api` (`@repo/api`)                   | NestJS 11 (Express 5) + Mongoose 9 — zod DTOs via nestjs-zod, global `api` prefix, AI module under `src/ai/`                           |
| `packages/schemas` (`@repo/schemas`)       | The zod 4 domain contract — schemas + inferred types shared by api and web. **Compiled** (tsup, dual ESM/CJS)                          |
| `packages/api-client` (`@repo/api-client`) | Orval-generated TanStack Query hooks + MSW mocks from `apps/api/openapi.json`, plus hand-written fetch/auth runtime. **JIT TS source** |
| `packages/eslint-config`                   | Shared flat ESLint configs, including the lint-enforced architecture rules (`react.js` webArchitecture, `nestjs.js` API bans)          |
| `packages/typescript-config`               | Shared tsconfig bases                                                                                                                  |

## Dependency direction

```
apps/web ──▶ @repo/api-client ──▶ (nothing in-repo; peers: react, react-query, msw)
apps/web ──▶ @repo/schemas ◀── apps/api
```

- **Apps never import apps.** The only contract between web and api is
  `apps/api/openapi.json` → the generated client in `packages/api-client`.
- `@repo/api-client` depends on no workspace package; it is regenerated _from_
  the api's OpenAPI output, not linked _to_ the api.
- Anything both api and web need at the type/validation level goes in
  `@repo/schemas` — nowhere else.

## Must

- Add every dependency through the catalog: `"<pkg>": "catalog:"` in the
  package, version pinned once in `pnpm-workspace.yaml`.
- After changing `packages/schemas`, rebuild it: `pnpm --filter @repo/schemas build`
  (turbo's `^build` does this automatically inside `pnpm build/test/check-types`).
- After changing any controller/DTO in `apps/api`, regenerate the client:
  `pnpm gen:client` — and commit the regenerated files (they are drift-checked in CI).
- Keep new endpoints flowing through the whole chain (see the vertical slice
  below): schema → DTO → controller → `openapi.json` → generated hooks → route + feature.
- Run commands per package with `pnpm --filter @repo/<name> <script>`.

## Must not

- **Never hand-edit a generated artifact** (table below). Fix the source and regenerate.
- Never import from another workspace package's `src/` internals — only its
  published exports (`@repo/schemas`, `@repo/api-client`, `@repo/api-client/mocks`).
- Never add a second home for shared domain types (no `shared/types.ts` in an app).
- Never add a version number in a package's `package.json` when a catalog entry exists.

## Generated artifacts

| Artifact                               | Source of truth                   | Regenerate with                                                                         | Notes                                                           |
| -------------------------------------- | --------------------------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `apps/web/src/routeTree.gen.ts`        | files in `apps/web/src/routes/`   | `pnpm --filter @repo/web routes:generate` (also auto-regenerates while `vite dev` runs) | NEVER hand-edit; eslint-ignored in `apps/web/eslint.config.mjs` |
| `apps/api/openapi.json`                | Nest controllers + zod DTOs       | `pnpm gen:client` (turbo runs `@repo/api#emit-openapi` after `build`)                   | NEVER hand-edit; committed contract                             |
| `packages/api-client/src/generated/**` | `apps/api/openapi.json` via orval | `pnpm gen:client` (turbo chain: api build → emit-openapi → orval)                       | NEVER hand-edit; committed and drift-checked                    |

## Compiled vs source packages

- `@repo/schemas` is **compiled** because NestJS consumes it at plain Node
  runtime — there is no TS loader in `node dist/main.js`. Its exports point at
  build output, dual-format:

  ```json
  ".": {
    "import": { "types": "./dist/index.d.ts", "default": "./dist/index.js" },
    "require": { "types": "./dist/index.d.cts", "default": "./dist/index.cjs" }
  }
  ```

- `@repo/api-client` is **JIT TypeScript source** — its only consumer is Vite,
  which transpiles workspace TS on the fly, so there is no build step to forget:

  ```json
  "exports": { ".": "./src/index.ts", "./mocks": "./src/mocks.ts" }
  ```

## Canonical example in this repo: the Patients vertical slice

Trace one feature end-to-end; every new domain feature copies this shape.

1. **Contract** — `packages/schemas/src/medical.ts`: `PatientSchema`,
   `PatientCreateSchema`, `PatientUpdateSchema`, `PatientListQuerySchema`,
   `PatientListResponseSchema` (re-exported from `src/index.ts`).
2. **API module** — `apps/api/src/patients/`: `patient.schema.ts` (Mongoose),
   `patients.repository.ts`, `patients.service.ts`, `patients.controller.ts`,
   `patients.module.ts`, and `dto/patients.dto.ts`, which is nothing but the
   shared contract wrapped for Nest:

   ```ts
   export class PatientDto extends createZodDto(PatientSchema) {}
   export class PatientCreateDto extends createZodDto(PatientCreateSchema) {}
   export class PatientUpdateDto extends createZodDto(PatientUpdateSchema) {}
   export class PatientListQueryDto extends createZodDto(PatientListQuerySchema) {}
   export class PatientListResponseDto extends createZodDto(PatientListResponseSchema) {}
   ```

3. **Wire contract** — `apps/api/openapi.json`, emitted from those decorators
   and DTOs by `dist/scripts/emit-openapi.js`.
4. **Generated client** — `packages/api-client/src/generated/patients/patients.ts`
   (`usePatientsListInfinite`, `getPatientsListInfiniteQueryOptions`,
   `usePatientsCreate`, `usePatientsUpdate`, `usePatientsRemove`, …) plus
   `patients.msw.ts` mock handlers and `patients.faker.ts` fixtures.
5. **Web routes** — `apps/web/src/routes/_authenticated/patients/{index,new,$patientId}.tsx`:
   pure config that prefetches through the same generated `queryOptions`
   (standard: [component-structure.md](./component-structure.md)).
6. **Web feature** — `apps/web/src/features/patients/` with its hook/view/container
   triples and a pages-only barrel (anatomy: [component-structure.md](./component-structure.md)).

## Where to look

- `turbo.json` — the task graph (`generate` depends on `@repo/api#emit-openapi`, which depends on `build`).
- `pnpm-workspace.yaml` — workspace globs, the version catalog, `allowBuilds` postinstall allow-list.
- `packages/*/package.json` — each package's exports surface.
- Endpoint design details: [api-design.md](./api-design.md). Client/state details: [data-and-state.md](./data-and-state.md).
