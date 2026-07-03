import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from './create-test-app';

/**
 * Runtime settings: admin-only access, write-only secrets, whole-config
 * validation, and hot-reload of the model registry (no restart).
 */
describe('settings (e2e)', () => {
  let app: INestApplication;
  let server: Parameters<typeof request>[0];
  let adminToken: string;
  let memberToken: string;

  beforeAll(async () => {
    app = await createTestApp('settings-e2e');
    server = app.getHttpServer();

    const signup = async (email: string) => {
      const res = await request(server)
        .post('/api/auth/signup')
        .send({ email, password: 'longenough-pass', name: email.split('@')[0] })
        .expect(201);
      return res.body as { accessToken: string; user: { id: string; role: string } };
    };

    const admin = await signup('admin@example.com');
    expect(admin.user.role).toBe('member'); // signups are members by default
    memberToken = (await signup('member@example.com')).accessToken;

    // Promote directly in the database (the env bootstrap has its own suites).
    const { getModelToken } = await import('@nestjs/mongoose');
    const userModel = app.get<{
      updateOne: (f: unknown, u: unknown) => { exec: () => Promise<unknown> };
    }>(getModelToken('User'));
    await userModel.updateOne({ email: 'admin@example.com' }, { $set: { role: 'admin' } }).exec();
    adminToken = admin.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects members and anonymous callers', async () => {
    await request(server).get('/api/settings').expect(401);
    await request(server)
      .get('/api/settings')
      .set('Authorization', `Bearer ${memberToken}`)
      .expect(403);
    await request(server)
      .put('/api/settings')
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ ai: { dailyTokenBudget: 1 } })
      .expect(403);
  });

  it('returns current settings with secrets masked', async () => {
    const res = await request(server)
      .get('/api/settings')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.ai.providerMode).toBe('mock');
    expect(res.body.ai.copilot).toMatchObject({ temperature: 0.7, maxOutputTokens: 4096 });
    expect(res.body.general.corsOrigins.length).toBeGreaterThan(0);
    expect(res.body.secrets.googleApiKey).toEqual({ set: false, hint: null });
    expect(JSON.stringify(res.body)).not.toContain('enc:v1');
  });

  it('updates copilot params and stores secrets write-only (masked, encrypted at rest)', async () => {
    const res = await request(server)
      .put('/api/settings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        ai: { copilot: { temperature: 0.2, maxOutputTokens: 1024 } },
        secrets: { googleApiKey: 'AQ.test-key-value-1234' },
      })
      .expect(200);

    expect(res.body.ai.copilot.temperature).toBe(0.2);
    expect(res.body.secrets.googleApiKey).toEqual({ set: true, hint: '…1234' });
    expect(JSON.stringify(res.body)).not.toContain('test-key-value');

    // At rest: encrypted, never plaintext.
    const { getModelToken } = await import('@nestjs/mongoose');
    const settingModel = app.get<{
      findById: (id: string) => { lean: () => Promise<{ value: string } | null> };
    }>(getModelToken('AppSetting'));
    const stored = await settingModel.findById('secret:googleApiKey').lean();
    expect(stored?.value).toMatch(/^enc:v1:/);
    expect(stored?.value).not.toContain('test-key-value');
  });

  it('hot-reloads the model registry when the copilot model changes', async () => {
    await request(server)
      .put('/api/settings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        ai: { providerMode: 'auto', copilot: { model: 'google:gemini-3.5-flash' } },
      })
      .expect(200);

    const models = await request(server)
      .get('/api/ai/models')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const copilot = models.body.features.find(
      (f: { feature: string }) => f.feature === 'copilot-chat',
    );
    expect(copilot.model).toBe('google:gemini-3.5-flash');

    // Back to mock so later suites stay keyless.
    await request(server)
      .put('/api/settings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ai: { providerMode: 'mock' } })
      .expect(200);
  });

  it('rejects incoherent configs before saving (auto mode without the needed key)', async () => {
    // Clear the google key, then demand a google copilot in auto mode.
    await request(server)
      .put('/api/settings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ secrets: { googleApiKey: null } })
      .expect(200);

    const res = await request(server)
      .put('/api/settings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ai: { providerMode: 'auto', copilot: { model: 'google:gemini-3.5-flash' } } })
      .expect(400);
    expect(res.body.message).toContain('Gemini API key');

    // The failed update must not have been applied.
    const after = await request(server)
      .get('/api/settings')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(after.body.ai.providerMode).toBe('mock');
  });

  it('validates field ranges through the shared schema', async () => {
    await request(server)
      .put('/api/settings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ai: { copilot: { temperature: 5 } } })
      .expect(400);
    await request(server)
      .put('/api/settings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ general: { corsOrigins: ['not-a-url'] } })
      .expect(400);
  });
});
