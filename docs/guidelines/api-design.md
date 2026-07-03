# API Design

How endpoints are shaped in `apps/api`: REST conventions, zod-first DTOs, the thin-repository Mongoose layer, and the OpenAPI → orval pipeline that turns every controller change into regenerated client hooks. The domain contract itself (schemas, wire types) lives in `packages/schemas` — see `data-and-state.md` for how the web app consumes the generated client.

## Must

- **Plural-noun resources, global `api` prefix.** Controllers declare the resource only (`@Controller('tasks')`, `@Controller('auth')`); `app.setGlobalPrefix('api')` in `apps/api/src/app.setup.ts` mounts everything under `/api/...`. Never hardcode `api/` inside a controller path.
- **Standard verb/status mapping.** `POST` create → 201 (Nest default), `GET`/`PATCH` → 200, `DELETE` and side-effect-only endpoints → `@HttpCode(HttpStatus.NO_CONTENT)`. Non-create `POST`s (e.g. login) set `@HttpCode(HttpStatus.OK)` explicitly.
- **Cursor pagination, one shape.** List endpoints accept `CursorQuerySchema` fields (`cursor?`, `limit` 1–100 default 20) and return `cursorPage(ItemSchema)` = `{ items: Item[], nextCursor: string | null }` from `packages/schemas/src/common.ts`. Repositories fetch `limit + 1` rows sorted `{ _id: -1 }` to compute `hasMore`; the service sets `nextCursor` to the last item's `_id` string or `null`.
- **Zod-first DTOs, always in this order:** (1) schema in `packages/schemas` (rebuild it: `pnpm --filter @repo/schemas build`), (2) a `createZodDto` class in the module's `dto/` file, (3) `@ZodResponse({ status, type })` on every handler that returns a body. `apps/api/src/tasks/dto/tasks.dto.ts` is the whole pattern:
  ```ts
  export class TaskDto extends createZodDto(TaskSchema) {}
  export class TaskCreateDto extends createZodDto(TaskCreateSchema) {}
  ```
- **Rely on the globally registered pipe/interceptor/filter** — they are already wired in `apps/api/src/app.module.ts`:
  ```ts
  { provide: APP_PIPE, useClass: ZodValidationPipe },
  { provide: APP_INTERCEPTOR, useClass: ZodSerializerInterceptor },
  { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ```
  DTO classes on `@Body()`/`@Query()`/`@Param()` are validated automatically; `@ZodResponse` types are serialized (and stripped of extra keys) automatically.
- **One thin repository per feature.** `TasksRepository`, `SessionsRepository`, etc. wrap `@InjectModel` with intent-named methods (`findPageByOwner`, `updateForOwner`). Ownership filters (`ownerId`) live inside every repository query — see `security.md`.
- **Mongoose 9 idioms used here:**
  - `.lean()` on every read; repositories return `Lean<X>` types (`Task & { _id: Types.ObjectId }`), never hydrated documents.
  - `findOneAndUpdate(..., { returnDocument: 'after' })` for read-back updates (see `TasksRepository.updateForOwner` and `SessionsRepository.rotateByCurrentHash`) — update pipelines are not used in this codebase.
  - Union-typed props need an explicit type: `@Prop({ type: String, enum: ['todo', 'in_progress', 'done'], default: 'todo' })` in `apps/api/src/tasks/task.schema.ts`.
  - Validate `Types.ObjectId.isValid(id)` before constructing an ObjectId from client input (returns `null`/`false`, which the service turns into a 404).
- **Map documents to wire shape in the service.** A private `toDto` converts `_id → id: string`, `Date → toISOString()`, drops `ownerId`. Mongoose types (`Types.ObjectId`, `Date`, lean docs) never leave `apps/api`; everything crossing the wire is a `@repo/schemas` type.
- **Regenerate the client after ANY controller or DTO change:** `pnpm gen:client` (root). Turbo runs the chain `@repo/api build → emit-openapi (writes apps/api/openapi.json) → orval (writes packages/api-client/src/generated/**)`. Both outputs are committed; CI (`.github/workflows/ci.yml`) re-runs the chain and fails on `git diff --exit-code`.
- **Name handler methods for the hooks they become.** `buildOpenApiDocument` in `apps/api/src/openapi.ts` derives operationIds from controller + method: `TasksController.list` → `tasksList` → generated `useTasksList` / `getTasksListQueryOptions`. Keep method names short verbs (`list`, `create`, `get`, `update`, `remove`) and let the factory prefix them.

## Must not

- **Never define request/response shapes inline in the API.** No ad-hoc `z.object()` DTOs in controllers, no interfaces for wire types — the schema lives in `packages/schemas` or it does not exist. (Copilot tool `inputSchema`s are the one sanctioned inline-zod spot; they are model-facing, not wire-facing.)
- **Never use class-validator / class-transformer** — banned by `@repo/eslint-config` nestjs config. zod via nestjs-zod is the only validation layer.
- **Never skip `@ZodResponse`** on a body-returning handler. Without it the response bypasses serialization (leaking extra fields) and the OpenAPI document loses the response schema, breaking generated types.
- **No generic `Repository<T>` / base-class abstractions.** Each feature's repository states its queries plainly; shared query "helpers" hide the ownership predicate.
- **Never return hydrated Mongoose documents or lean docs from a service.** If a controller can see `_id` or a `Date` object, the mapping layer was skipped.
- **Never hand-edit `apps/api/openapi.json` or `packages/api-client/src/generated/**`** — both are generated and drift-checked. Fix the controller/schema and rerun `pnpm gen:client`.
- **No offset/page-number pagination.** Cursor-only (`_id` descending); offset pagination skips/duplicates rows under concurrent writes.

## Canonical example in this repo

The tasks module (`apps/api/src/tasks/`) is the reference resource. Controller — pure routing, DTOs, `@ZodResponse`, user identity from the JWT (`apps/api/src/tasks/tasks.controller.ts`):

```ts
@Get()
@ZodResponse({ status: 200, type: TaskListResponseDto })
async list(@CurrentUser() user: AuthenticatedUser, @Query() query: TaskListQueryDto) {
  return this.tasksService.list(user.userId, query);
}
```

Repository — owner-scoped cursor page, `limit + 1` overfetch, `.lean()` (`apps/api/src/tasks/tasks.repository.ts`):

```ts
const rows = await this.model
  .find(filter)
  .sort({ _id: -1 })
  .limit(query.limit + 1)
  .lean();
return { items: rows.slice(0, query.limit), hasMore: rows.length > query.limit };
```

Service — wire mapping, `ownerId` never leaves the API (`apps/api/src/tasks/tasks.service.ts`):

```ts
/** Lean doc → wire shape. ObjectIds → strings, Dates → ISO; ownerId never leaves. */
function toDto(task: LeanTask): TaskDto {
  return {
    id: task._id.toString(),
    title: task.title,
    ...
```

Schema side, `packages/schemas/src/tasks.ts` composes the list response from the shared helper:

```ts
export const TaskListResponseSchema = cursorPage(TaskSchema);
```

## Adding or changing an endpoint (checklist)

1. Define/extend the zod schema in `packages/schemas/src/<domain>.ts`; export input, output, and (for lists) `cursorPage(...)` response types. Run `pnpm --filter @repo/schemas build` (turbo's `^build` also handles this on downstream builds).
2. Wrap them in `createZodDto` classes in `apps/api/src/<feature>/dto/<feature>.dto.ts`.
3. Add the repository method (owner-scoped filter, `.lean()`), the service method (ObjectId conversion, `toDto` mapping, HTTP exceptions), then the controller handler (`@ZodResponse`, correct `@HttpCode`, `@CurrentUser()` for identity).
4. Cover it: unit spec next to the service (`tasks.service.spec.ts` style) and/or `apps/api/test/*.e2e-spec.ts` — detail: `docs/guidelines/testing.md`.
5. Run `pnpm gen:client` and commit `apps/api/openapi.json` + `packages/api-client/src/generated/**` alongside the API change — CI's drift gate rejects the PR otherwise.
6. If the web app consumes it, use the newly generated hooks/queryOptions only from the file kinds the web-architecture lint allows — detail: `docs/guidelines/architecture.md`.

## Where to look

- REST plumbing (prefix, helmet, CORS, cookie-parser): `apps/api/src/app.setup.ts`
- Global pipe/interceptor/guard/filter registration: `apps/api/src/app.module.ts`
- Pagination + envelope primitives: `packages/schemas/src/common.ts`
- operationId naming + `cleanupOpenApiDoc`: `apps/api/src/openapi.ts`
- orval generation settings (mutator, suspense/infinite hooks, MSW mocks): `packages/api-client/orval.config.ts`
- Generation task graph (`emit-openapi` → `generate`): `turbo.json`; drift gate: `.github/workflows/ci.yml`
- How generated hooks are consumed in the web app: `docs/guidelines/data-and-state.md`
- Error envelope semantics: `docs/guidelines/error-handling.md`; authz rules: `docs/guidelines/security.md`
