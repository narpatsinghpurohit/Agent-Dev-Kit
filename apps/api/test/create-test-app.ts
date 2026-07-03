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
  // Hermetic: a developer's real keys/overrides in apps/api/.env must never
  // seed the test settings store (process.env beats the .env file).
  process.env.GOOGLE_GENERATIVE_AI_API_KEY = '';
  process.env.AWS_BEARER_TOKEN_BEDROCK = '';
  process.env.AI_MODEL_COPILOT_CHAT = '';
  process.env.AI_MODEL_SUMMARIZE = '';
  process.env.AI_MODEL_SPEECH_STT = '';
  process.env.AI_MODEL_SPEECH_TTS = '';
  process.env.CORS_ORIGINS = 'http://localhost:5173';

  const { AppModule } = await import('../src/app.module.js');
  const { configureApp } = await import('../src/app.setup.js');

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication({ logger: false });
  configureApp(app);
  await app.init();
  return app;
}
