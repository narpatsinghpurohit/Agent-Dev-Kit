import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { inject } from 'vitest';

/**
 * Boots the real AppModule (global guards, pipes, filters, middleware) on an
 * isolated database. Env must be set before app.module is imported, hence
 * the dynamic import.
 */
export async function createTestApp(dbName: string): Promise<INestApplication> {
  const baseUri = inject('mongoUri'); // e.g. mongodb://127.0.0.1:PORT/?replicaSet=testset
  process.env.NODE_ENV = 'test';
  process.env.MONGODB_URI = baseUri.replace('/?', `/${dbName}?`);
  process.env.JWT_ACCESS_SECRET ??= 'e2e-test-secret-0123456789abcdefghijklmnop';
  process.env.AI_PROVIDER_MODE = 'mock';

  const { AppModule } = await import('../src/app.module.js');
  const { configureApp } = await import('../src/app.setup.js');

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication({ logger: false });
  configureApp(app);
  await app.init();
  return app;
}
