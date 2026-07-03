/**
 * Lint-wall smoke tests. These are the guarantee that the view/hook file
 * standard is mechanically enforced — if someone reorders the flat-config
 * objects (ban-then-unban depends on "last match wins") or renames a glob,
 * these tests fail before the architecture silently erodes.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';
import { nestjsConfig } from '../nestjs.js';
import { reactConfig, webArchitecture } from '../react.js';

const here = path.dirname(fileURLToPath(import.meta.url));

function linter(cwd: string, config: unknown[]) {
  return new ESLint({
    cwd,
    overrideConfigFile: true,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- ESLint's Config type is looser than our composed arrays
    overrideConfig: config as any,
  });
}

async function lintFixture(eslint: ESLint, file: string) {
  const [result] = await eslint.lintFiles([file]);
  if (!result) throw new Error(`no lint result for ${file}`);
  return result;
}

function ruleIds(result: ESLint.LintResult) {
  return result.messages.map((m) => m.ruleId);
}

describe('web architecture rules', () => {
  const cwd = path.join(here, 'fixtures', 'web-app');
  const eslint = linter(cwd, [...reactConfig, ...webArchitecture]);

  it('fails when a *.view.tsx imports the data layer', async () => {
    const result = await lintFixture(eslint, 'src/features/demo/demo.view.tsx');
    expect(ruleIds(result)).toContain('no-restricted-imports');
    expect(ruleIds(result)).toContain('no-restricted-syntax');
  });

  it('allows the data layer inside *.hook.ts', async () => {
    const result = await lintFixture(eslint, 'src/features/demo/demo.hook.ts');
    expect(ruleIds(result)).not.toContain('no-restricted-imports');
    expect(result.errorCount).toBe(0);
  });

  it('bans react-router-dom everywhere, including hooks-adjacent files', async () => {
    const result = await lintFixture(eslint, 'src/features/demo/legacy-router.tsx');
    expect(ruleIds(result)).toContain('no-restricted-imports');
  });

  it('rejects *.hook.tsx files outright', async () => {
    const result = await lintFixture(eslint, 'src/features/demo/wrong-ext.hook.tsx');
    expect(ruleIds(result)).toContain('no-restricted-syntax');
  });
});

describe('api architecture rules', () => {
  const cwd = path.join(here, 'fixtures', 'api-app');
  const eslint = linter(cwd, [...nestjsConfig]);

  it('bans direct AI provider imports in feature code', async () => {
    const result = await lintFixture(eslint, 'src/tasks/tasks.service.ts');
    expect(ruleIds(result)).toContain('no-restricted-imports');
  });

  it('allows AI provider imports inside src/ai/', async () => {
    const result = await lintFixture(eslint, 'src/ai/model-registry.ts');
    expect(ruleIds(result)).not.toContain('no-restricted-imports');
    expect(result.errorCount).toBe(0);
  });
});
