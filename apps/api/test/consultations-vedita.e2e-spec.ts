import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from './create-test-app';

/**
 * The Vedita layer on the keyless mock provider: extraction provenance +
 * capture chips, treatment-plan lifecycle, quick-asks, private insight
 * turns, AHMIS signing, and the manual provenance rewrite on doctor edits.
 */
describe('consultations — vedita (e2e, mock provider)', () => {
  let app: INestApplication;
  let server: Parameters<typeof request>[0];
  let doctorToken: string;
  let otherToken: string;
  let patientId: string;

  beforeAll(async () => {
    app = await createTestApp('consultations-vedita-e2e');
    server = app.getHttpServer();

    const signup = async (email: string) => {
      const res = await request(server)
        .post('/api/auth/signup')
        .send({ email, password: 'longenough-pass', name: email.split('@')[0] })
        .expect(201);
      return res.body.accessToken as string;
    };
    doctorToken = await signup('vedita-doctor@example.com');
    otherToken = await signup('vedita-other@example.com');

    const patient = await request(server)
      .post('/api/patients')
      .set('Authorization', asDoctor())
      .send({ name: 'Asha Devi', age: 54, sex: 'female', language: 'hi-IN' })
      .expect(201);
    patientId = patient.body.id;
  });

  afterAll(async () => {
    await app.close();
  });

  const asDoctor = () => `Bearer ${doctorToken}`;
  const asOther = () => `Bearer ${otherToken}`;

  async function startConsultation(): Promise<string> {
    const res = await request(server)
      .post('/api/consultations')
      .set('Authorization', asDoctor())
      .send({ patientId, doctorLanguage: 'en-IN' })
      .expect(201);
    return res.body.id as string;
  }

  /** ask + typed answer + finish — the shortest path to a completed record. */
  async function finishedConsultation() {
    const id = await startConsultation();
    await request(server)
      .post(`/api/consultations/${id}/ask`)
      .set('Authorization', asDoctor())
      .send({ text: 'What brings you in?' })
      .expect(200);
    await request(server)
      .post(`/api/consultations/${id}/answer-text`)
      .set('Authorization', asDoctor())
      .send({ text: 'Fever for two days.' })
      .expect(200);
    const finished = await request(server)
      .post(`/api/consultations/${id}/finish`)
      .set('Authorization', asDoctor())
      .expect(200);
    return { id, body: finished.body };
  }

  it('finish drafts the summary WITH provenance and stamps capture chips on cited turns', async () => {
    const { body } = await finishedConsultation();

    // Mock draft: chief complaint sourced from the first patient turn at
    // the fallback confidence.
    const patientTurn = body.turns.find((turn: { speaker: string }) => turn.speaker === 'patient');
    expect(body.summary.provenance.chiefComplaint).toMatchObject({
      origin: 'ai',
      confidence: 0.6,
      sourceTurnId: patientTurn.id,
      sourceAt: patientTurn.at,
      isNew: true,
    });
    // The cited turn carries the capture chip.
    expect(patientTurn.capturedFields).toEqual(['chiefComplaint']);
    // Uncited turns stay chip-free.
    const doctorTurn = body.turns.find((turn: { speaker: string }) => turn.speaker === 'doctor');
    expect(doctorTurn.capturedFields).toEqual([]);
  });

  describe('treatment plan', () => {
    it('400s while the consultation is in progress', async () => {
      const id = await startConsultation();
      await request(server)
        .post(`/api/consultations/${id}/treatment-plan`)
        .set('Authorization', asDoctor())
        .expect(400);
      await request(server)
        .get(`/api/consultations/${id}/treatment-plan`)
        .set('Authorization', asDoctor())
        .expect(404); // no plan yet
    });

    it('generates a deterministic 3-category plan, persists it, and records verdicts', async () => {
      const { id } = await finishedConsultation();

      const generated = await request(server)
        .post(`/api/consultations/${id}/treatment-plan`)
        .set('Authorization', asDoctor())
        .expect(200);
      const plan = generated.body.treatmentPlan;
      expect(plan.items).toHaveLength(3);
      expect(plan.items.map((item: { category: string }) => item.category).sort()).toEqual([
        'ahara',
        'herbal',
        'vihara',
      ]);
      for (const item of plan.items) {
        expect(item.state).toBe('suggested');
        // One patient in the panel — no cohort, so evidence must be
        // qualitative (never an invented percentage).
        expect(item.evidence).not.toMatch(/%/);
      }
      expect(plan.cohortSize).toBeNull();

      // GET serves the embedded plan symmetrically.
      const fetched = await request(server)
        .get(`/api/consultations/${id}/treatment-plan`)
        .set('Authorization', asDoctor())
        .expect(200);
      expect(fetched.body.items).toHaveLength(3);

      // Accept one, modify another — verdicts persist on the consultation.
      const accepted = await request(server)
        .patch(`/api/consultations/${id}/treatment-plan/herbal-1`)
        .set('Authorization', asDoctor())
        .send({ state: 'accepted' })
        .expect(200);
      expect(
        accepted.body.treatmentPlan.items.find((item: { id: string }) => item.id === 'herbal-1')
          .state,
      ).toBe('accepted');

      const modified = await request(server)
        .patch(`/api/consultations/${id}/treatment-plan/ahara-1`)
        .set('Authorization', asDoctor())
        .send({ state: 'modified', editedBody: 'Salt under 5g/day; warm khichdi evenings.' })
        .expect(200);
      const aharaItem = modified.body.treatmentPlan.items.find(
        (item: { id: string }) => item.id === 'ahara-1',
      );
      expect(aharaItem).toMatchObject({
        state: 'modified',
        editedBody: 'Salt under 5g/day; warm khichdi evenings.',
      });

      // Unknown recommendation id → 404.
      await request(server)
        .patch(`/api/consultations/${id}/treatment-plan/herbal-9`)
        .set('Authorization', asDoctor())
        .send({ state: 'accepted' })
        .expect(404);

      // Regeneration is a documented full overwrite — verdicts reset.
      const regenerated = await request(server)
        .post(`/api/consultations/${id}/treatment-plan`)
        .set('Authorization', asDoctor())
        .expect(200);
      for (const item of regenerated.body.treatmentPlan.items) {
        expect(item.state).toBe('suggested');
      }
    });
  });

  it('quick-asks returns 3 deterministic doctor-language questions while in progress', async () => {
    const id = await startConsultation();
    const res = await request(server)
      .post(`/api/consultations/${id}/quick-asks`)
      .set('Authorization', asDoctor())
      .expect(200);
    expect(res.body.questions).toHaveLength(3);
    for (const question of res.body.questions) {
      expect(typeof question).toBe('string');
      expect(question.length).toBeGreaterThan(0);
    }

    // Nothing persisted — the transcript is untouched.
    const consultation = await request(server)
      .get(`/api/consultations/${id}`)
      .set('Authorization', asDoctor())
      .expect(200);
    expect(consultation.body.turns).toHaveLength(0);
  });

  it('quick-asks 400s once the consultation is completed', async () => {
    const { id } = await finishedConsultation();
    await request(server)
      .post(`/api/consultations/${id}/quick-asks`)
      .set('Authorization', asDoctor())
      .expect(400);
  });

  it('insight appends a private vedita turn in the doctor language', async () => {
    const id = await startConsultation();
    await request(server)
      .post(`/api/consultations/${id}/ask`)
      .set('Authorization', asDoctor())
      .send({ text: 'Any headaches?' })
      .expect(200);

    const res = await request(server)
      .post(`/api/consultations/${id}/insight`)
      .set('Authorization', asDoctor())
      .expect(200);

    const last = res.body.turns.at(-1);
    expect(last).toMatchObject({
      speaker: 'vedita',
      kind: 'insight',
      isPrivate: true,
      sourceLanguage: 'en-IN',
      targetLanguage: 'en-IN',
    });
    // Vedita speaks to the doctor only — no translation happens.
    expect(last.translatedText).toBe(last.sourceText);
    expect(last.sourceText).toContain('mock insight');
    // No cohort in a one-patient panel — the fallback must say so, not
    // invent a percentage.
    expect(last.sourceText).toContain('COHORT: insufficient data');
  });

  it('insight 400s once the consultation is completed', async () => {
    const { id } = await finishedConsultation();
    await request(server)
      .post(`/api/consultations/${id}/insight`)
      .set('Authorization', asDoctor())
      .expect(400);
  });

  describe('ahmis sign', () => {
    it('400s before completion, then flips the status idempotently', async () => {
      const id = await startConsultation();
      await request(server)
        .post(`/api/consultations/${id}/ahmis-sign`)
        .set('Authorization', asDoctor())
        .expect(400);

      await request(server)
        .post(`/api/consultations/${id}/ask`)
        .set('Authorization', asDoctor())
        .send({ text: 'What brings you in?' })
        .expect(200);
      await request(server)
        .post(`/api/consultations/${id}/answer-text`)
        .set('Authorization', asDoctor())
        .send({ text: 'Fever for two days.' })
        .expect(200);
      await request(server)
        .post(`/api/consultations/${id}/finish`)
        .set('Authorization', asDoctor())
        .expect(200);

      const signed = await request(server)
        .post(`/api/consultations/${id}/ahmis-sign`)
        .set('Authorization', asDoctor())
        .expect(200);
      expect(signed.body.ahmisStatus).toBe('synced');
      expect(signed.body.ahmisSyncedAt).toBeTruthy();

      // Idempotent: re-signing keeps the original timestamp.
      const again = await request(server)
        .post(`/api/consultations/${id}/ahmis-sign`)
        .set('Authorization', asDoctor())
        .expect(200);
      expect(again.body.ahmisStatus).toBe('synced');
      expect(again.body.ahmisSyncedAt).toBe(signed.body.ahmisSyncedAt);
    });
  });

  it('updateSummary rewrites provenance server-side and ignores client provenance', async () => {
    const { id, body } = await finishedConsultation();
    const summary = body.summary;

    const corrected = await request(server)
      .patch(`/api/consultations/${id}/summary`)
      .set('Authorization', asDoctor())
      .send({
        ...summary,
        chiefComplaint: 'Fever, 2 days — corrected by doctor',
        // The client tries to smuggle provenance — the server must drop it.
        provenance: {
          chiefComplaint: {
            confidence: 0.01,
            sourceTurnId: 'turn_forged',
            sourceAt: null,
            isNew: true,
            origin: 'ai',
          },
        },
      })
      .expect(200);

    // Changed field → manual, full confidence, no source turn.
    expect(corrected.body.summary.provenance.chiefComplaint).toEqual({
      confidence: 1,
      sourceTurnId: null,
      sourceAt: null,
      isNew: false,
      origin: 'manual',
    });
    // Unchanged field → the AI metadata survives.
    expect(corrected.body.summary.provenance.additionalNotes).toMatchObject({
      origin: 'ai',
      confidence: 0.6,
    });
  });

  it('enforces ownership as 404 on every vedita route', async () => {
    const { id } = await finishedConsultation();
    for (const route of [`treatment-plan`, `quick-asks`, `insight`, `ahmis-sign`]) {
      await request(server)
        .post(`/api/consultations/${id}/${route}`)
        .set('Authorization', asOther())
        .expect(404);
    }
    await request(server)
      .get(`/api/consultations/${id}/treatment-plan`)
      .set('Authorization', asOther())
      .expect(404);
    await request(server)
      .patch(`/api/consultations/${id}/treatment-plan/herbal-1`)
      .set('Authorization', asOther())
      .send({ state: 'accepted' })
      .expect(404);
  });
});
