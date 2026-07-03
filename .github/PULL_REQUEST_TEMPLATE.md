## Summary

<!-- What does this PR change, and why? Link the issue if one exists. -->

## Definition of Done

- [ ] `pnpm lint`, `pnpm check-types`, and `pnpm test` pass for every affected package.
- [ ] If the API surface changed: `pnpm gen:client` was run and the regenerated `apps/api/openapi.json` + `packages/api-client/src/generated/**` are committed.
- [ ] If web routes changed: `apps/web/src/routeTree.gen.ts` was regenerated and committed.
- [ ] No secrets committed; no hand edits to generated files.
- [ ] New or changed behavior is covered by tests per docs/guidelines/testing.md.
- [ ] Commit messages follow Conventional Commits with a lowercase subject.

## Guidelines consulted

<!-- List the docs/guidelines/*.md files relevant to this change, e.g. api-design.md, testing.md. -->
