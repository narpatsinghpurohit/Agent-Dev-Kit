@AGENTS.md

## Claude-specific notes

- Nested `CLAUDE.md` files auto-load per directory (`apps/api`, `apps/web`, `packages`) —
  they each point at the local `AGENTS.md`. Trust the most specific one for local rules.
- Repo hooks auto-format your edits (prettier) and run the affected package's typecheck
  when you stop. If a hook reports errors, fix them before finishing — do not ignore them.
- Skill routing:
  - `/new-feature` — full-stack feature: schema → API → client regen → web screen.
  - `/api-endpoint` — add or change a NestJS endpoint (DTOs, guard, tests, gen:client).
  - `/web-feature` — add a web screen the hook/view/container way.
  - `/ai-feature` — anything touching models: registry, prompts, tools, budgets.
  - `/write-tests` — test authoring for any layer, using the repo's harnesses.
- Before working in an unfamiliar area, read `docs/guidelines/00-index.md` and follow its
  pointer to the one doc that owns that area. Do not guess conventions from training data —
  this repo bans several "usual" choices (passport, class-validator, react-router-dom).
- Never edit `routeTree.gen.ts`, `openapi.json`, or `packages/api-client/src/generated/**`;
  regenerate them (commands in AGENTS.md).
