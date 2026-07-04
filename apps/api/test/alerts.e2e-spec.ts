import type { INestApplication } from '@nestjs/common';
import { Types } from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AlertsService } from '../src/alerts/alerts.service';
import { createTestApp } from './create-test-app';

const SEED_DEFS = [
  {
    title: 'Fever with rash cluster — Ward 12',
    detail: 'Unusual rise in fever-with-rash presentations near the primary school.',
    caseCount: 14,
    radiusKm: 3,
    windowLabel: 'last 14 days',
    severity: 'warning' as const,
    createdAt: new Date('2026-07-01T00:00:00.000Z'),
  },
  {
    title: 'Seasonal viral conjunctivitis uptick',
    detail: 'Mild seasonal rise; advise hand hygiene at triage.',
    caseCount: null,
    radiusKm: null,
    windowLabel: 'last 30 days',
    severity: 'info' as const,
    createdAt: new Date('2026-06-15T00:00:00.000Z'),
  },
];

describe('alerts (e2e)', () => {
  let app: INestApplication;
  let server: Parameters<typeof request>[0];
  let aliceToken: string;
  let bobToken: string;
  let newerId: string;

  beforeAll(async () => {
    app = await createTestApp('alerts-e2e');
    server = app.getHttpServer();

    // Alerts are global seeded reference data with no create endpoint —
    // populate through the same service method the seed script uses.
    await app.get(AlertsService).ensureSeeded(SEED_DEFS);

    const signup = async (email: string) => {
      const res = await request(server)
        .post('/api/auth/signup')
        .send({ email, password: 'longenough-pass', name: email.split('@')[0] })
        .expect(201);
      return res.body.accessToken as string;
    };
    aliceToken = await signup('alice@example.com');
    bobToken = await signup('bob@example.com');
  });

  afterAll(async () => {
    await app.close();
  });

  const asAlice = () => `Bearer ${aliceToken}`;
  const asBob = () => `Bearer ${bobToken}`;

  it('requires auth on every route', async () => {
    await request(server).get('/api/alerts').expect(401);
    await request(server)
      .post(`/api/alerts/${new Types.ObjectId().toString()}/dismiss`)
      .expect(401);
  });

  it('lists seeded alerts newest first in the wire shape', async () => {
    const res = await request(server)
      .get('/api/alerts')
      .set('Authorization', asAlice())
      .expect(200);

    expect(res.body.items).toHaveLength(2);
    expect(res.body.items.map((a: { title: string }) => a.title)).toEqual([
      'Fever with rash cluster — Ward 12', // newer
      'Seasonal viral conjunctivitis uptick',
    ]);
    const [newest] = res.body.items;
    expect(newest.id).toMatch(/^[0-9a-f]{24}$/);
    expect(newest).toMatchObject({ severity: 'warning', caseCount: 14, radiusKm: 3 });
    expect(newest.createdAt).toBe('2026-07-01T00:00:00.000Z');
    expect(newest).not.toHaveProperty('_id');
    expect(newest).not.toHaveProperty('ownerId');
    newerId = newest.id;
  });

  it('dismissing hides the alert for that user only', async () => {
    await request(server)
      .post(`/api/alerts/${newerId}/dismiss`)
      .set('Authorization', asAlice())
      .expect(204);

    const alice = await request(server)
      .get('/api/alerts')
      .set('Authorization', asAlice())
      .expect(200);
    expect(alice.body.items).toHaveLength(1);
    expect(alice.body.items[0].title).toBe('Seasonal viral conjunctivitis uptick');

    // Bob never dismissed anything — he still sees both.
    const bob = await request(server).get('/api/alerts').set('Authorization', asBob()).expect(200);
    expect(bob.body.items).toHaveLength(2);
  });

  it('duplicate dismiss is idempotent (204 again, list unchanged)', async () => {
    await request(server)
      .post(`/api/alerts/${newerId}/dismiss`)
      .set('Authorization', asAlice())
      .expect(204);

    const alice = await request(server)
      .get('/api/alerts')
      .set('Authorization', asAlice())
      .expect(200);
    expect(alice.body.items).toHaveLength(1);
  });

  it('404s an unknown or malformed alert id', async () => {
    await request(server)
      .post(`/api/alerts/${new Types.ObjectId().toString()}/dismiss`)
      .set('Authorization', asAlice())
      .expect(404);
    await request(server)
      .post('/api/alerts/not-an-id/dismiss')
      .set('Authorization', asAlice())
      .expect(404);
  });

  it('re-seeding upserts by title — no duplicates, dismissals survive', async () => {
    await app
      .get(AlertsService)
      .ensureSeeded([{ ...SEED_DEFS[0]!, detail: 'Case count revised upward.' }]);

    // Same two alerts for Bob, with refreshed content on the matched title.
    const bob = await request(server).get('/api/alerts').set('Authorization', asBob()).expect(200);
    expect(bob.body.items).toHaveLength(2);
    expect(bob.body.items[0]).toMatchObject({
      id: newerId,
      detail: 'Case count revised upward.',
    });

    // Alice's dismissal still applies — the upsert kept the same alert id.
    const alice = await request(server)
      .get('/api/alerts')
      .set('Authorization', asAlice())
      .expect(200);
    expect(alice.body.items).toHaveLength(1);
  });
});
