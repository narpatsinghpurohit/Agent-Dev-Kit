import { defineConfig } from 'tsup';

// Compiled package: the NestJS API consumes this at Node runtime, so unlike
// bundler-only packages it ships dist (ESM + CJS + d.ts). See docs/adr/0002.
export default defineConfig((options) => ({
  entry: [
    'src/index.ts',
    'src/common.ts',
    'src/auth.ts',
    'src/user.ts',
    'src/tasks.ts',
    'src/ai.ts',
    'src/settings.ts',
  ],
  format: ['esm', 'cjs'],
  // tsup's dts pass injects the deprecated `baseUrl`, which TypeScript 6
  // rejects (TS5101) without this opt-out. Remove when tsup stops doing so.
  dts: { compilerOptions: { ignoreDeprecations: '6.0' } },
  sourcemap: true,
  // Never clean in watch mode: `pnpm dev` runs the api/web type-checkers
  // against dist/ concurrently, and cleaning yanks the .d.ts files out from
  // under them (TS7016 storms until something retriggers a compile).
  clean: !options.watch,
}));
