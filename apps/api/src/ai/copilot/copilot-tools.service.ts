import { Injectable } from '@nestjs/common';
import { tool } from 'ai';
import { z } from 'zod';
import { PatientCreateSchema, objectIdString } from '@repo/schemas';
import { ConsultationsService } from '../../consultations/consultations.service';
import { PatientsService } from '../../patients/patients.service';

/**
 * Copilot tools are thin adapters over the SAME domain services the REST API
 * uses — authz, validation, and business rules apply identically.
 *
 * Security invariants:
 * - `userId` comes from the verified JWT (closure), never from model input.
 * - Mutating tools require in-chat user approval (declared in chat.service).
 */
@Injectable()
export class CopilotToolsService {
  constructor(
    private readonly patientsService: PatientsService,
    private readonly consultationsService: ConsultationsService,
  ) {}

  buildFor(userId: string) {
    return {
      listPatients: tool({
        description:
          "List this clinic's patients, optionally filtered by a name search. Use this before answering questions about patients or referencing patient ids.",
        inputSchema: z.object({
          search: z.string().max(120).optional().describe('Case-insensitive name filter'),
        }),
        execute: async ({ search }) => {
          const page = await this.patientsService.list(userId, { search, limit: 50 });
          return {
            patients: page.items.map((patient) => ({
              id: patient.id,
              name: patient.name,
              age: patient.age,
              sex: patient.sex,
              language: patient.language,
            })),
          };
        },
      }),

      createPatient: tool({
        description:
          'Register a new patient. language is the Sarvam code the app will speak to them in (e.g. hi-IN for Hindi).',
        inputSchema: PatientCreateSchema,
        execute: async (input) => {
          const patient = await this.patientsService.create(userId, input);
          return {
            created: { id: patient.id, name: patient.name, language: patient.language },
          };
        },
      }),

      getPatientHistory: tool({
        description:
          "A patient's recorded consultations — chief complaints, red flags, and status. Look the patient id up with listPatients first.",
        inputSchema: z.object({
          patientId: objectIdString.describe('Patient id from listPatients'),
        }),
        execute: async ({ patientId }) => {
          const patient = await this.patientsService.get(userId, patientId);
          const page = await this.consultationsService.list(userId, { patientId, limit: 5 });
          return {
            patient: { id: patient.id, name: patient.name, age: patient.age, sex: patient.sex },
            consultations: page.items.map((consultation) => ({
              id: consultation.id,
              status: consultation.status,
              startedAt: consultation.createdAt,
              chiefComplaint: consultation.summary?.chiefComplaint ?? null,
              redFlags: consultation.summary?.redFlags ?? [],
            })),
          };
        },
      }),
    };
  }
}

export type CopilotTools = ReturnType<CopilotToolsService['buildFor']>;
