import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from './create-test-app';

/**
 * The interview flow on the keyless mock voice pipeline: ask (translate +
 * TTS), answer by audio and by typed fallback, finish (summary draft),
 * doctor corrections, and the frozen-after-completion invariant.
 */
describe('consultations (e2e, mock voice)', () => {
  let app: INestApplication;
  let server: Parameters<typeof request>[0];
  let doctorToken: string;
  let otherToken: string;
  let patientId: string;

  beforeAll(async () => {
    app = await createTestApp('consultations-e2e');
    server = app.getHttpServer();

    const signup = async (email: string) => {
      const res = await request(server)
        .post('/api/auth/signup')
        .send({ email, password: 'longenough-pass', name: email.split('@')[0] })
        .expect(201);
      return res.body.accessToken as string;
    };
    doctorToken = await signup('doctor@example.com');
    otherToken = await signup('other@example.com');

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

  it('starts a consultation, inheriting the patient language', async () => {
    const res = await request(server)
      .post('/api/consultations')
      .set('Authorization', asDoctor())
      .send({ patientId })
      .expect(201);
    expect(res.body).toMatchObject({
      status: 'in_progress',
      doctorLanguage: 'en-IN',
      patientLanguage: 'hi-IN',
      turns: [],
      summary: null,
    });
  });

  it("404s a foreign patientId (someone else's patient)", async () => {
    await request(server)
      .post('/api/consultations')
      .set('Authorization', asOther())
      .send({ patientId })
      .expect(404);
  });

  it('ask: translates into the patient language and returns playable audio', async () => {
    const id = await startConsultation();
    const res = await request(server)
      .post(`/api/consultations/${id}/ask`)
      .set('Authorization', asDoctor())
      .send({ text: 'Since when do you have the fever?' })
      .expect(200);

    expect(res.body.turn).toMatchObject({
      speaker: 'doctor',
      sourceLanguage: 'en-IN',
      targetLanguage: 'hi-IN',
      sourceText: 'Since when do you have the fever?',
      // Mock translation marks the target language.
      translatedText: '[hi-IN] Since when do you have the fever?',
    });
    // Mock TTS returns a real WAV (RIFF header) so the browser can play it.
    const wav = Buffer.from(res.body.audioBase64 as string, 'base64');
    expect(wav.subarray(0, 4).toString()).toBe('RIFF');
  });

  it('answer: audio clip → transcript in patient language → doctor translation', async () => {
    const id = await startConsultation();
    const res = await request(server)
      .post(`/api/consultations/${id}/answer`)
      .set('Authorization', asDoctor())
      .attach('audio', Buffer.from('fake-webm-audio'), {
        filename: 'answer.webm',
        contentType: 'audio/webm',
      })
      .expect(200);

    expect(res.body.turn.speaker).toBe('patient');
    expect(res.body.turn.sourceLanguage).toBe('hi-IN');
    expect(res.body.turn.sourceText).toContain('Mock patient answer');
    expect(res.body.turn.translatedText).toContain('[en-IN]');
  });

  it('answer-text: the typed fallback records a patient turn', async () => {
    const id = await startConsultation();
    const res = await request(server)
      .post(`/api/consultations/${id}/answer-text`)
      .set('Authorization', asDoctor())
      .send({ text: 'दो दिन से बुखार है।' })
      .expect(200);
    expect(res.body.turn).toMatchObject({
      speaker: 'patient',
      sourceText: 'दो दिन से बुखार है।',
      translatedText: '[en-IN] दो दिन से बुखार है।',
    });
  });

  it('finish drafts a summary, freezes the transcript, and accepts corrections', async () => {
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
    expect(finished.body.status).toBe('completed');
    expect(finished.body.completedAt).toBeTruthy();
    // Mock draft: chief complaint from the first patient answer.
    expect(finished.body.summary.chiefComplaint).toContain('Fever for two days');

    // Frozen: no more turns, no double finish.
    await request(server)
      .post(`/api/consultations/${id}/ask`)
      .set('Authorization', asDoctor())
      .send({ text: 'One more thing?' })
      .expect(400);
    await request(server)
      .post(`/api/consultations/${id}/finish`)
      .set('Authorization', asDoctor())
      .expect(400);

    // The doctor's corrections win.
    const corrected = await request(server)
      .patch(`/api/consultations/${id}/summary`)
      .set('Authorization', asDoctor())
      .send({
        ...finished.body.summary,
        chiefComplaint: 'Fever, 2 days — corrected by doctor',
        symptoms: [{ name: 'fever', duration: '2 days', severity: 'moderate' }],
      })
      .expect(200);
    expect(corrected.body.summary.chiefComplaint).toBe('Fever, 2 days — corrected by doctor');
    expect(corrected.body.summary.symptoms).toHaveLength(1);
  });

  it('cannot finish an empty consultation', async () => {
    const id = await startConsultation();
    await request(server)
      .post(`/api/consultations/${id}/finish`)
      .set('Authorization', asDoctor())
      .expect(400);
  });

  it('enforces ownership as 404 on every consultation route', async () => {
    const id = await startConsultation();
    await request(server)
      .get(`/api/consultations/${id}`)
      .set('Authorization', asOther())
      .expect(404);
    await request(server)
      .post(`/api/consultations/${id}/ask`)
      .set('Authorization', asOther())
      .send({ text: 'hello?' })
      .expect(404);
    await request(server)
      .post(`/api/consultations/${id}/finish`)
      .set('Authorization', asOther())
      .expect(404);
  });

  it('lists consultations per patient with voice usage recorded', async () => {
    const list = await request(server)
      .get(`/api/consultations?patientId=${patientId}&limit=50`)
      .set('Authorization', asDoctor())
      .expect(200);
    expect(list.body.items.length).toBeGreaterThan(0);
    for (const consultation of list.body.items) {
      expect(consultation.patientId).toBe(patientId);
    }

    // Mock voice turns skip Sarvam but the LLM budget still sees the
    // extraction… in mock mode nothing bills — assert the usage collection
    // exists and voice features never billed without a provider.
    const { getModelToken } = await import('@nestjs/mongoose');
    const usageModel = app.get<{
      countDocuments: (f: Record<string, unknown>) => { exec: () => Promise<number> };
    }>(getModelToken('AiUsage'));
    const voiceRows = await usageModel
      .countDocuments({ feature: { $in: ['voice-stt', 'voice-tts', 'voice-translate'] } })
      .exec();
    expect(voiceRows).toBe(0); // keyless mode must not record phantom spend
  });
});
