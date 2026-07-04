import { NestFactory } from '@nestjs/core';
import { Types } from 'mongoose';

/**
 * Idempotent demo data: a few patients (different languages), a clinical
 * profile + vitals + today's queue for the primary patient, global outbreak
 * alerts, and one completed consultation for the bootstrap admin. The admin
 * account itself comes from ADMIN_EMAIL/ADMIN_PASSWORD in apps/api/.env —
 * AdminBootstrapService creates it during context init.
 * Usage: pnpm db:seed  (requires Mongo from `pnpm db:up`)
 */
async function main(): Promise<void> {
  const { AppModule } = await import('../app.module.js');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });

  const { ConfigService } = await import('@nestjs/config');
  const { UsersService } = await import('../users/users.service.js');
  const { PatientsService } = await import('../patients/patients.service.js');
  const { VitalsService } = await import('../vitals/vitals.service.js');
  const { QueueService } = await import('../queue/queue.service.js');
  const { AlertsService } = await import('../alerts/alerts.service.js');
  const { ConsultationsRepository } = await import('../consultations/consultations.repository.js');

  const configService = app.get(ConfigService);
  const usersService = app.get(UsersService);
  const patientsService = app.get(PatientsService);
  const vitalsService = app.get(VitalsService);
  const queueService = app.get(QueueService);
  const alertsService = app.get(AlertsService);
  const consultationsRepository = app.get(ConsultationsRepository);

  const email = configService.get<string | undefined>('ADMIN_EMAIL');
  if (!email) {
    console.error(
      'ADMIN_EMAIL/ADMIN_PASSWORD are not set in apps/api/.env — nothing to seed.\n' +
        'Copy .env.example (it ships dev-only admin credentials) and re-run.',
    );
    process.exitCode = 1;
    await app.close();
    return;
  }

  const user = await usersService.findByEmail(email);
  if (!user) {
    console.error(`Admin ${email} was not bootstrapped — check the API logs.`);
    process.exitCode = 1;
    await app.close();
    return;
  }
  console.log(`Admin account: ${email} (from ADMIN_EMAIL)`);

  // Global reference data, upserted by title — refreshed on every run, even
  // when the per-owner data below is already in place.
  const day = (daysAgo: number) => new Date(Date.now() - daysAgo * 86_400_000);
  await alertsService.ensureSeeded([
    {
      title: 'Fever-with-rash cluster',
      detail:
        '14 fever-with-rash cases logged within 5 km this week — district AHMIS ' +
        'alert active. Screen walk-ins for exposure.',
      caseCount: 14,
      radiusKm: 5,
      windowLabel: 'this week',
      severity: 'warning',
      createdAt: day(1),
    },
    {
      title: 'Seasonal advisory: dengue vigilance',
      detail:
        'Monsoon onset in the district — advise patients on stagnant-water control ' +
        'and report suspected dengue presentations to the PHC.',
      caseCount: null,
      radiusKm: null,
      windowLabel: 'this month',
      severity: 'info',
      createdAt: day(6),
    },
  ]);
  console.log('Seeded 2 outbreak alerts');

  const ownerId = user._id.toString();
  const existing = await patientsService.list(ownerId, { limit: 1 });
  if (existing.items.length > 0) {
    console.log('Patients already seeded');
    await app.close();
    return;
  }

  const asha = await patientsService.create(ownerId, {
    name: 'Asha Devi',
    age: 54,
    sex: 'female',
    language: 'hi-IN',
    phone: '+91 98765 43210',
    notes: 'Prefers morning visits.',
  });
  const murugan = await patientsService.create(ownerId, {
    name: 'Murugan Selvam',
    age: 41,
    sex: 'male',
    language: 'ta-IN',
  });
  const rohit = await patientsService.create(ownerId, {
    name: 'Rohit Sharma',
    age: 29,
    sex: 'male',
    language: 'en-IN',
  });
  console.log('Seeded 3 patients (Hindi, Tamil, English)');

  // Clinical profile for the primary patient — mirrors the console design.
  await patientsService.updateClinical(ownerId, asha.id, {
    prakriti: 'vata-kapha',
    conditions: ['Hypertension', 'Obesity'],
    regimen: [
      { name: 'Sarpagandha vati', dose: '1', schedule: 'BD' },
      { name: 'Arjuna kwatha', schedule: 'morning' },
      { name: 'Anulom-Vilom', dose: '10 min', schedule: 'daily' },
    ],
  });
  console.log('Seeded clinical profile for Asha Devi');

  // Four readings over ~2 months: rising BP (last three strictly rising) and
  // ~1.5 kg of weight loss, so the vitals trends render out of the box.
  const vitals = [
    { daysAgo: 60, systolic: 132, diastolic: 86, pulse: 74, weightKg: 75.5 },
    { daysAgo: 40, systolic: 138, diastolic: 88, pulse: 76, weightKg: 75.2 },
    { daysAgo: 20, systolic: 145, diastolic: 90, pulse: 79, weightKg: 74.6 },
    { daysAgo: 0, systolic: 152, diastolic: 94, pulse: 84, weightKg: 74 },
  ];
  for (const { daysAgo, ...reading } of vitals) {
    await vitalsService.create(ownerId, asha.id, {
      ...reading,
      takenAt: day(daysAgo).toISOString(),
      takenBy: 'compounder',
    });
  }
  console.log(`Seeded ${vitals.length} vitals readings for Asha Devi`);

  // Today's OPD queue (design copy): times sit inside the current UTC day so
  // GET /queue picks them up whenever the seed runs.
  const now = new Date();
  const todayAt = (hour: number, minute: number) =>
    new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hour, minute),
    ).toISOString();
  const active = await queueService.create(ownerId, {
    patientId: asha.id,
    reason: 'Hypertension follow-up',
    scheduledAt: todayAt(9, 0),
  });
  await queueService.update(ownerId, active.id, { status: 'active' });
  await queueService.create(ownerId, {
    patientId: murugan.id,
    reason: 'Kidney stone review',
    scheduledAt: todayAt(10, 15),
  });
  await queueService.create(ownerId, {
    patientId: rohit.id,
    reason: 'Obesity consult',
    scheduledAt: todayAt(10, 40),
  });
  console.log('Seeded 3 queue entries for today (1 active)');

  // One completed consultation with a finished record, straight through the
  // repository — the seed must not spend AI tokens on extraction.
  const owner = new Types.ObjectId(ownerId);
  const consultation = await consultationsRepository.create(owner, {
    patientId: new Types.ObjectId(asha.id),
    doctorLanguage: 'en-IN',
    patientLanguage: 'hi-IN',
  });
  const at = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000);
  // Shared with the provenance below so sourceAt matches the turn exactly.
  const answer1At = at(31);
  const answer2At = at(29);
  await consultationsRepository.appendTurnForOwner(owner, consultation._id.toString(), {
    id: 'turn_seed_1',
    speaker: 'doctor',
    kind: 'utterance',
    isPrivate: false,
    capturedFields: [],
    sourceLanguage: 'en-IN',
    targetLanguage: 'hi-IN',
    sourceText: 'What brings you in today?',
    translatedText: 'आज आप किस तकलीफ़ से आई हैं?',
    at: at(32),
  });
  await consultationsRepository.appendTurnForOwner(owner, consultation._id.toString(), {
    id: 'turn_seed_2',
    speaker: 'patient',
    kind: 'utterance',
    isPrivate: false,
    // Backfilled to match the seeded summary's provenance below.
    capturedFields: ['chiefComplaint', 'symptoms.0', 'symptoms.1'],
    sourceLanguage: 'hi-IN',
    targetLanguage: 'en-IN',
    sourceText: 'दो दिन से बुखार है और सिर में दर्द रहता है।',
    translatedText: 'I have had a fever for two days and a constant headache.',
    at: answer1At,
  });
  await consultationsRepository.appendTurnForOwner(owner, consultation._id.toString(), {
    id: 'turn_seed_3',
    speaker: 'doctor',
    kind: 'utterance',
    isPrivate: false,
    capturedFields: [],
    sourceLanguage: 'en-IN',
    targetLanguage: 'hi-IN',
    sourceText: 'Are you taking any medicines at the moment?',
    translatedText: 'क्या आप अभी कोई दवा ले रही हैं?',
    at: at(30),
  });
  await consultationsRepository.appendTurnForOwner(owner, consultation._id.toString(), {
    id: 'turn_seed_4',
    speaker: 'patient',
    kind: 'utterance',
    isPrivate: false,
    capturedFields: ['medications.0'],
    sourceLanguage: 'hi-IN',
    targetLanguage: 'en-IN',
    sourceText: 'सिर्फ़ पैरासिटामोल, बुखार के लिए।',
    translatedText: 'Only paracetamol, for the fever.',
    at: answer2At,
  });
  // Hand-written provenance matching the capturedFields stamped on the
  // turns above — what the extractor would have produced.
  const sourced = (turnId: string, sourceAt: Date, confidence: number) => ({
    confidence,
    sourceTurnId: turnId,
    sourceAt: sourceAt.toISOString(),
    isNew: true,
    origin: 'ai' as const,
  });
  await consultationsRepository.completeForOwner(owner, consultation._id.toString(), {
    chiefComplaint: 'Fever for two days with constant headache',
    symptoms: [
      { name: 'fever', duration: '2 days', severity: 'moderate' },
      { name: 'headache', duration: '2 days' },
    ],
    history: '',
    medications: ['paracetamol'],
    allergies: [],
    redFlags: [],
    additionalNotes: 'Seeded example consultation.',
    provenance: {
      chiefComplaint: sourced('turn_seed_2', answer1At, 0.92),
      'symptoms.0': sourced('turn_seed_2', answer1At, 0.9),
      'symptoms.1': sourced('turn_seed_2', answer1At, 0.86),
      'medications.0': sourced('turn_seed_4', answer2At, 0.95),
    },
  });
  console.log('Seeded 1 completed consultation for Asha Devi');

  await app.close();
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
