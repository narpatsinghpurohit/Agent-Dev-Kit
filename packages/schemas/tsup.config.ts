import { defineConfig } from 'tsup';

// Compiled package: the NestJS API consumes this at Node runtime, so unlike
// bundler-only packages it ships dist (ESM + CJS + d.ts). See docs/adr/0002.
export default defineConfig({
  entry: [
    'src/index.ts',
    'src/common.ts',
    'src/auth.ts',
    'src/user.ts',
    'src/tasks.ts',
    'src/ai.ts',
  ],
  format: ['esm', 'cjs'],
  // tsup's dts pass injects the deprecated `baseUrl`, which TypeScript 6
  // rejects (TS5101) without this opt-out. Remove when tsup stops doing so.
  dts: { compilerOptions: { ignoreDeprecations: '6.0' } },
  sourcemap: true,
  clean: true,
});
