import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Separate file: the daily budget env is snapshotted at app-module import,
 * so the tiny budget needs its own worker.
 */
describe('ai token budget (e2e)', () => {
  let app: INestApplication;
  let server: Parameters<typeof request>[0];
  let token: string;

  beforeAll(async () => {
    process.env.AI_DAILY_TOKEN_BUDGET = '50'; // far below one chat's reserve
    const { createTestApp } = await import('./create-test-app.js');
    app = await createTestApp('ai-budget-e2e');
    server = app.getHttpServer();
    const res = await request(server)
      .post('/api/auth/signup')
      .send({ email: 'broke@example.com', password: 'longenough-pass', name: 'Broke' })
      .expect(201);
    token = res.body.accessToken;
  });

  afterAll(async () => {
    delete process.env.AI_DAILY_TOKEN_BUDGET;
    await app.close();
  });

  it('rejects chat with 429 once the daily budget cannot cover the reserve', async () => {
    const res = await request(server)
      .post('/api/ai/chat')
      .set('Authorization', `Bearer ${token}`)
      .send({
        id: 'chat-budget',
        messages: [{ id: 'm1', role: 'user', parts: [{ type: 'text', text: 'hi' }] }],
      })
      .expect(429);
    expect(res.body.message).toContain('budget');
  });
});
