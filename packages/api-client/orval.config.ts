import { defineConfig } from 'orval';

/**
 * openapi.json (committed by @repo/api's emit-openapi) → typed TanStack
 * Query v5 hooks + MSW handlers. Regenerate with `pnpm gen:client`;
 * CI fails when src/generated drifts from the API surface.
 */
export default defineConfig({
  api: {
    input: '../../apps/api/openapi.json',
    output: {
      target: './src/generated/endpoints.ts',
      schemas: './src/generated/models',
      client: 'react-query',
      httpClient: 'fetch',
      mode: 'tags-split',
      clean: true,
      mock: true,
      override: {
        mutator: {
          path: './src/http/custom-fetch.ts',
          name: 'customFetch',
        },
        query: {
          useQuery: true,
          useSuspenseQuery: true,
          useInfinite: true,
          useInfiniteQueryParam: 'cursor',
          signal: true,
        },
        mock: {
          // Deterministic fixtures — random mocks make tests flaky.
          useExamples: false,
        },
      },
    },
  },
});
