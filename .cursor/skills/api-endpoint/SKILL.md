---
name: api-endpoint
description: Adds a NestJS endpoint or module following the repo's canonical patients-module pattern (zod DTOs, @ZodResponse, ownership-as-query-predicate). Use when creating or extending API routes in apps/api.
---

The patients module is THE template — read it before writing anything. Detail:
docs/guidelines/api-design.md and docs/guidelines/security.md.

## Steps

1. **Read the template files** in `apps/api/src/patients/`:
   - `patient.schema.ts` — Mongoose schema (`@Schema({ collection: 'patients', timestamps: true })`, indexed `ownerId`).
   - `patients.repository.ts` — every query includes `ownerId` in the FILTER
     ("ownership is a query predicate, never a post-fetch check").
   - `patients.service.ts` — maps repository nulls to `NotFoundException`
     (missing OR foreign = 404, never 403).
   - `patients.controller.ts` — thin; `@CurrentUser()` supplies `user.userId`.
   - `dto/patients.dto.ts` — DTO wiring, nothing else.
   - `patients.module.ts` — `MongooseModule.forFeature` + providers.

2. **Wire zod DTOs from @repo/schemas** — never define request/response shapes
   inline and never use class-validator (lint-banned). Exactly like
   `apps/api/src/patients/dto/patients.dto.ts`:

   ```ts
   export class PatientDto extends createZodDto(PatientSchema) {}
   export class PatientCreateDto extends createZodDto(PatientCreateSchema) {}
   ```

   If the schema is new, add it to `packages/schemas/src/` first and rebuild
   (`pnpm --filter @repo/schemas build`).

3. **Declare responses with `@ZodResponse`** on every handler that returns a
   body — it drives both runtime serialization (global ZodSerializerInterceptor)
   and the OpenAPI spec orval consumes:

   ```ts
   @Get()
   @ZodResponse({ status: 200, type: PatientListResponseDto })
   ```

   204 routes use `@HttpCode(HttpStatus.NO_CONTENT)` and return `void`
   (see `remove` in `patients.controller.ts`).

4. **Auth is on by default.** The global `AuthGuard` in `app.module.ts`
   protects every route — add nothing for protected endpoints. Public routes
   opt out with `@Public()` AND get a throttle override, exactly like
   `apps/api/src/auth/auth.controller.ts`:

   ```ts
   const AUTH_THROTTLE = { default: { limit: 5, ttl: 60_000 } };
   ```

   Throttler TTLs are MILLISECONDS (`60_000` = 1 minute), not seconds.

5. **Register the module** in `apps/api/src/app.module.ts` `imports` if it is
   new. Do not touch the global providers (guards/pipe/interceptor/filter) —
   they already apply to your endpoint. Errors surface through
   `AllExceptionsFilter` in the `ErrorResponseSchema` envelope; throw standard
   Nest HttpExceptions and let the filter shape them.

6. **Tests.**
   - Unit spec next to the service, modeled on
     `apps/api/src/auth/auth.service.spec.ts`.
   - E2e spec in `apps/api/test/`, modeled on
     `apps/api/test/patients.e2e-spec.ts` (boots via `test/create-test-app.ts`
     on an in-memory Mongo replica set; signs up two users and asserts the
     cross-user 404 — replicate that for any owned resource).
   - Run `pnpm --filter @repo/api test && pnpm --filter @repo/api test:e2e`.

7. **Regenerate the client — do not skip.** Any contract change requires
   `pnpm gen:client` (turbo: api build → emit-openapi → orval).
   `apps/api/openapi.json` and `packages/api-client/src/generated/**` are
   committed and drift-checked in CI: commit the regenerated output with your
   change, and never hand-edit either.
