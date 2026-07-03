# packages/ — shared workspace packages

## Map

- `schemas` (`@repo/schemas`) — the zod 4 domain contract; the single type source for api, web, and future clients.
- `api-client` (`@repo/api-client`) — orval-generated TanStack Query hooks + MSW mocks over `apps/api/openapi.json`, plus the auth-aware fetch runtime (`src/http/`, `src/auth/`).
- `eslint-config` (`@repo/eslint-config`) — flat configs (`base` / `react` / `nestjs` / `node`); the architecture rules live HERE as lint rules.
- `typescript-config` (`@repo/typescript-config`) — tsconfig bases (`base.json`, `nestjs.json`, `react-app.json`).

## Hard rules

1. `schemas` is COMPILED (tsup, dual ESM/CJS) — after editing, run `pnpm --filter @repo/schemas build` or consumers see stale types; turbo `^build` covers pipeline runs. detail: docs/guidelines/data-and-state.md
2. `schemas` stays platform-neutral: zod only — no Node, DOM, Nest, or React imports; `ownerId` and password hashes never appear in wire schemas. detail: docs/guidelines/api-design.md
3. Adding a new schema entry file means adding it to `tsup.config.ts` `entry` AND `package.json` `exports` — both, or imports break in one module system.
4. `api-client/src/generated/**` is generated, committed, and drift-checked — never hand-edit; regenerate with `pnpm gen:client` from the root. detail: docs/guidelines/architecture.md
5. Runtime code in `api-client` (`custom-fetch.ts`, `auth-fetch.ts`, `token-storage.ts`) is hand-written and owns the injected `TokenStorage` + single-flight 401 refresh — change it deliberately, with tests. detail: docs/guidelines/security.md
6. `eslint-config` changes are guarded by fixture tests (`test/web-architecture.test.ts` + `test/fixtures/`) — run `pnpm --filter @repo/eslint-config test` after touching any config, and update fixtures with rule changes. detail: docs/guidelines/architecture.md
7. All dependency versions come from the root catalog (`catalog:` protocol); never pin a version inside a package. detail: docs/guidelines/architecture.md

## Local gotchas

- `schemas/tsup.config.ts` carries `dts: { compilerOptions: { ignoreDeprecations: '6.0' } }` — a deliberate wart for tsup's dts pass under TypeScript 6; do not remove it until tsup stops injecting `baseUrl`.
- `api-client` regeneration is a chain, not one script: api `build` → `emit-openapi` → orval (`pnpm gen:client` runs all three via turbo).
- Loosening a ban in `eslint-config/react.js` or `nestjs.js` is an architecture decision — check the relevant guideline doc first, not just the failing lint message.
