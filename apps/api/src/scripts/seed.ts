import { NestFactory } from '@nestjs/core';
import { Types } from 'mongoose';

/**
 * Idempotent demo data: a few patients (different languages) and one
 * completed consultation for the bootstrap admin. The admin account itself
 * comes from ADMIN_EMAIL/ADMIN_PASSWORD in apps/api/.env —
 * AdminBootstrapService creates it during context init.
 * Usage: pnpm db:seed  (requires Mongo from `pnpm db:up`)
 */
async function main(): Promise<void> {
  const { AppModule } = await import('../app.module.js');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });

  const { ConfigService } = await import('@nestjs/config');
  const { UsersService } = await import('../users/users.service.js');
  const { PatientsService } = await import('../patients/patients.service.js');
  const { ConsultationsRepository } = await import('../consultations/consultations.repository.js');

  const configService = app.get(ConfigService);
  const usersService = app.get(UsersService);
  const patientsService = app.get(PatientsService);
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
  await patientsService.create(ownerId, {
    name: 'Murugan Selvam',
    age: 41,
    sex: 'male',
    language: 'ta-IN',
  });
  await patientsService.create(ownerId, {
    name: 'Rohit Sharma',
    age: 29,
    sex: 'male',
    language: 'en-IN',
  });
  console.log('Seeded 3 patients (Hindi, Tamil, English)');

  // One completed consultation with a finished record, straight through the
  // repository — the seed must not spend AI tokens on extraction.
  const owner = new Types.ObjectId(ownerId);
  const consultation = await consultationsRepository.create(owner, {
    patientId: new Types.ObjectId(asha.id),
    doctorLanguage: 'en-IN',
    patientLanguage: 'hi-IN',
  });
  const at = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000);
  await consultationsRepository.appendTurnForOwner(owner, consultation._id.toString(), {
    id: 'turn_seed_1',
    speaker: 'doctor',
    sourceLanguage: 'en-IN',
    targetLanguage: 'hi-IN',
    sourceText: 'What brings you in today?',
    translatedText: 'आज आप किस तकलीफ़ से आई हैं?',
    at: at(32),
  });
  await consultationsRepository.appendTurnForOwner(owner, consultation._id.toString(), {
    id: 'turn_seed_2',
    speaker: 'patient',
    sourceLanguage: 'hi-IN',
    targetLanguage: 'en-IN',
    sourceText: 'दो दिन से बुखार है और सिर में दर्द रहता है।',
    translatedText: 'I have had a fever for two days and a constant headache.',
    at: at(31),
  });
  await consultationsRepository.appendTurnForOwner(owner, consultation._id.toString(), {
    id: 'turn_seed_3',
    speaker: 'doctor',
    sourceLanguage: 'en-IN',
    targetLanguage: 'hi-IN',
    sourceText: 'Are you taking any medicines at the moment?',
    translatedText: 'क्या आप अभी कोई दवा ले रही हैं?',
    at: at(30),
  });
  await consultationsRepository.appendTurnForOwner(owner, consultation._id.toString(), {
    id: 'turn_seed_4',
    speaker: 'patient',
    sourceLanguage: 'hi-IN',
    targetLanguage: 'en-IN',
    sourceText: 'सिर्फ़ पैरासिटामोल, बुखार के लिए।',
    translatedText: 'Only paracetamol, for the fever.',
    at: at(29),
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
  });
  console.log('Seeded 1 completed consultation for Asha Devi');

  await app.close();
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
