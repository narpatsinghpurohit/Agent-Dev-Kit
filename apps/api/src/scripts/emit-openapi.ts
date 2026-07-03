import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';

/**
 * Emits the committed openapi.json artifact that packages/api-client is
 * generated from. Runs without a database (OPENAPI_EMIT=1 → lazy Mongo
 * connection) so the CI drift gate needs no infrastructure.
 *
 * Usage: pnpm --filter @repo/api emit-openapi
 */
async function main(): Promise<void> {
  process.env.OPENAPI_EMIT = '1';
  process.env.MONGODB_URI ??= 'mongodb://localhost:27017/openapi-emit';
  process.env.JWT_ACCESS_SECRET ??= 'openapi-emit-only-secret-0123456789abcdef';

  const { AppModule } = await import('../app.module.js');
  const { configureApp } = await import('../app.setup.js');
  const { buildOpenApiDocument } = await import('../openapi.js');

  const app = await NestFactory.create(AppModule, { logger: false });
  configureApp(app);
  await app.init();

  const document = buildOpenApiDocument(app);
  const outPath = resolve(__dirname, '../../openapi.json');
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(document, null, 2)}\n`);
  await app.close();

  console.log(`OpenAPI written to ${outPath}`);
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
