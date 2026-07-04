# ADR 0002 — the view/hook file standard for stateful web screens

Status: accepted · Date: 2026-07-03

## Context

React gives you no default answer to "where does the data code go", and LLM agents fill
that vacuum with whatever their training data saw most: queries inline in components,
fetch-in-useEffect, prop-drilled mutation callbacks. The result is screens that are hard
to test (every render needs a network) and hard to review (behavior and markup interleaved).
We wanted a structure that is (a) mechanically checkable, (b) cheap to follow, and
(c) greppable — an agent seeing one screen can replicate the pattern exactly.

## Decision

Every stateful screen is a **triple** (see `apps/web/src/features/patients/patient-list/`):

- `<name>.hook.ts` — the ViewModel: ALL data fetching, mutations, form state, and
  navigation; returns one typed object. Plain `.ts` — JSX in a hook file is a parse error.
- `<name>.view.tsx` — pure `props → JSX`; no queries, no router, no side effects.
- `<name>.tsx` — a ~5-line container wiring the two:

  ```tsx
  export function PatientListPage() {
    const viewModel = usePatientList();
    return <PatientListView {...viewModel} />;
  }
  ```

The split is **lint-enforced**, not aspirational: the `webArchitecture` block in
`packages/eslint-config/react.js` bans `@tanstack/react-query` and `@repo/api-client`
everywhere, then re-allows them only in `src/**/*.hook.ts`, `src/routes/**`,
`src/main.tsx`, `src/lib/**`, `src/shared/testing/**`, and test files. A second rule
rejects `*.hook.tsx` outright. Routes stay pure config and prefetch via the same generated
queryOptions the hook uses. Presentational leaves stay single-file; the triple is for
stateful screens only.

## Consequences

- Views test with plain props (no MSW needed); hooks test with `renderHookWithProviders`
  against MSW handlers. Both halves get cheap, focused tests.
- Agents cannot "accidentally" regress the architecture — the lint wall turns a judgment
  call into a hard error with a message that names the fix and the owning guideline doc.
- **Trade-off:** the naming is niche — `.hook.ts`/`.view.tsx` is not an ecosystem-wide
  convention, so nobody's training data fights for or against it. That is deliberate: an
  unfamiliar-but-consistent pattern is copied from neighbors, while a familiar-but-loose
  one gets "improved" back to inline queries. Greppability (`**/*.hook.ts`) is the payoff.
- **Trade-off:** ~2 extra files per screen and one indirection hop. Accepted; the container
  is trivially skimmable and the alternative (mixed concerns) costs more per change.
- The unban list is maintained by hand in `react.js`, guarded by fixture tests
  (`packages/eslint-config/test/web-architecture.test.ts`) so a config typo cannot
  silently open the wall.
