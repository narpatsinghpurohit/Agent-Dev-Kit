# ADR 0001 — pnpm workspaces with a version catalog; @repo/schemas ships compiled

Status: accepted · Date: 2026-07-03

## Context

A monorepo with two apps and four packages needs (a) one place where dependency versions
are decided and (b) a shared domain contract every runtime can consume. Two common
failure modes drove this decision:

- Version drift: each package pinning its own `zod`/`react`/`typescript` version until two
  workspaces disagree and types stop flowing across package boundaries.
- The "source-only shared package" trap: exporting raw `.ts` from a shared package works
  for bundler consumers (Vite) but breaks for Node runtime consumers (NestJS runs compiled
  JS from `dist/` and cannot execute a dependency's TypeScript source).

## Decision

1. **pnpm 11 workspaces, pnpm only.** The `catalog:` protocol in `pnpm-workspace.yaml` is
   the single version source; every workspace `package.json` references `"catalog:"`.
   `pnpm syncpack:lint` fails CI when a package pins its own diverging version. Install
   scripts are opt-in via `allowBuilds` (native binaries yes, telemetry postinstalls no).
2. **`@repo/schemas` is a compiled package.** tsup builds dual ESM + CJS + `.d.ts` from
   `src/*.ts` entries (see `packages/schemas/tsup.config.ts`), with per-domain subpath
   exports (`@repo/schemas/medical`, `/auth`, …). Turbo's `"dependsOn": ["^build"]` makes
   every consumer build wait for the schemas build.

## Consequences

- One `pnpm add` decision per dependency, made in the catalog; upgrades are a single-file
  diff. npm/yarn are unusable here by construction (`packageManager: pnpm@11.9.0`).
- The NestJS API imports the contract at Node runtime with zero transpilation hacks, and
  CJS consumers (some tooling still is) get a real `require` entry.
- **Trade-off:** an edit–rebuild loop. Changing a schema requires
  `pnpm --filter @repo/schemas build` (or `tsup --watch` via its `dev` script) before
  consumers see it; forgetting this yields stale-type confusion. Turbo hides it in
  pipelines, not in ad-hoc editor sessions.
- **Trade-off:** double bookkeeping — a new schema domain file must be added to both
  `tsup.config.ts` `entry` and `package.json` `exports`.
- **Wart, accepted:** tsup's dts pass injects the deprecated `baseUrl` compiler option,
  which TypeScript 6 rejects (TS5101). The config carries
  `dts: { compilerOptions: { ignoreDeprecations: '6.0' } }` until tsup stops doing so.
- Catalog discipline has a learning cost for agents: `"dependencies": { "x": "^1.2.3" }`
  is the reflexive move and it is exactly the one syncpack rejects. The rule is stated in
  root `AGENTS.md` and enforced in CI rather than trusted to memory.
