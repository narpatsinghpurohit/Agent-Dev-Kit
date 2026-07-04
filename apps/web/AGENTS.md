# apps/web — Vite + React SPA

## Layout

- `src/routes/` — TanStack Router file routes; pure config (validateSearch + loader `ensureQueryData` using the SAME generated queryOptions the hook uses). `src/routeTree.gen.ts` is GENERATED.
- `src/features/<feature>/` — screens as triples: `<name>.hook.ts` (ViewModel) + `<name>.view.tsx` (pure props → JSX) + `<name>.tsx` (~5-line container). Barrel `index.ts` exports pages only.
- `src/lib/auth.ts` — auth store; access token in module scope (never localStorage), silent refresh before router mount (`src/main.tsx`).
- `src/shared/testing/` — `test-utils.tsx` render helpers + MSW setup.
- `e2e/` — Playwright specs + `start-api.mjs` (boots the built API on in-memory Mongo, keyless).
- `src/styles.css` — Tailwind v4 design tokens in the `@theme` block.

## Commands

- `pnpm --filter @repo/web dev` — Vite on :5173, proxies `/api` → :3000 (start the API too).
- `pnpm --filter @repo/web routes:generate` — regenerate `routeTree.gen.ts` (also runs during `vite dev`).
- `pnpm --filter @repo/web test` — Vitest + Testing Library; `test:e2e` — Playwright (build api + web first).

## Hard rules

1. Stateful screens follow the hook/view/container triple; hook files are `.ts` — JSX in a hook file is a parse error by design. detail: docs/guidelines/component-structure.md
2. `@tanstack/react-query` and `@repo/api-client` import only in `*.hook.ts`, `src/routes/**`, `src/main.tsx`, `src/lib/**`, `src/shared/testing/**`, and tests (lint-enforced). detail: docs/guidelines/component-structure.md
3. `react-router-dom` is banned — TanStack Router only. detail: docs/guidelines/component-structure.md
4. Route loaders prefetch with the generated `get*QueryOptions` the hook also uses — one cache entry, no double fetch (see `src/routes/_authenticated/patients/index.tsx`). detail: docs/guidelines/data-and-state.md
5. Never store tokens in localStorage; auth flows go through `src/lib/auth.ts` and `@repo/api-client`'s single-flight refresh. detail: docs/guidelines/security.md
6. Web tests mock the network with MSW handlers from `@repo/api-client/mocks`, never hand-written fetch mocks. detail: docs/guidelines/testing.md
7. Styling uses the Tailwind v4 tokens from `src/styles.css` `@theme` — no ad-hoc hex colors in components. detail: docs/guidelines/naming-and-style.md

## Local gotchas

- `src/routeTree.gen.ts` — never hand-edit; regenerate (`routes:generate`) after adding/moving/renaming anything under `src/routes/`.
- The lint wall is ban-then-unban: `@repo/eslint-config/react.js` bans the data layer everywhere, then re-allows it in hook/route files. Don't "fix" import errors by disabling the rule — move the code to a `*.hook.ts`.
- `renderWithProviders` / `renderHookWithProviders` are ASYNC (router matching is async) — always `await` them or the first paint is empty.
- The Vite dev/preview proxy makes the API same-origin — the httpOnly refresh cookie depends on it. Don't call `http://localhost:3000` directly from web code; use relative `/api` paths.
- Tailwind v4 has no `tailwind.config.js` — tokens live in the `@theme` block in `src/styles.css`.
