/**
 * Boots the built API against an in-memory Mongo replica set for Playwright.
 * Keyless: AI runs on the mock provider, mail on the console driver.
 */
import { MongoMemoryReplSet } from 'mongodb-memory-server';

const replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });

process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = replSet.getUri('playwright-e2e');
process.env.JWT_ACCESS_SECRET = 'playwright-e2e-secret-0123456789abcdefghij';
process.env.AI_PROVIDER_MODE = 'mock';
process.env.PORT = '3000';
process.env.CORS_ORIGINS = 'http://localhost:4173';

await import('../../api/dist/main.js');
