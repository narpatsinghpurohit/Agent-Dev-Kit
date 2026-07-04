import { Injectable, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import type {
  ClinicalProfileUpdateInput,
  Patient as PatientDto,
  PatientClinicalProfile,
  PatientCreateInput,
  PatientListQuery,
  PatientListResponse,
  PatientUpdateInput,
} from '@repo/schemas';
import { type LeanPatient, PatientsRepository } from './patients.repository';

@Injectable()
export class PatientsService {
  constructor(private readonly patientsRepository: PatientsRepository) {}

  async create(ownerId: string, input: PatientCreateInput): Promise<PatientDto> {
    const patient = await this.patientsRepository.create(new Types.ObjectId(ownerId), input);
    return toDto(patient);
  }

  async list(ownerId: string, query: PatientListQuery): Promise<PatientListResponse> {
    const { items, hasMore } = await this.patientsRepository.findPageByOwner(
      new Types.ObjectId(ownerId),
      query,
    );
    return {
      items: items.map(toDto),
      nextCursor: hasMore && items.length > 0 ? items[items.length - 1]!._id.toString() : null,
    };
  }

  async get(ownerId: string, id: string): Promise<PatientDto> {
    const patient = await this.patientsRepository.findByIdForOwner(new Types.ObjectId(ownerId), id);
    // 404 (not 403) when it exists but is someone else's — no existence leak.
    if (!patient) throw new NotFoundException('Patient not found');
    return toDto(patient);
  }

  async update(ownerId: string, id: string, input: PatientUpdateInput): Promise<PatientDto> {
    const patient = await this.patientsRepository.updateForOwner(
      new Types.ObjectId(ownerId),
      id,
      input,
    );
    if (!patient) throw new NotFoundException('Patient not found');
    return toDto(patient);
  }

  async delete(ownerId: string, id: string): Promise<void> {
    const deleted = await this.patientsRepository.deleteForOwner(new Types.ObjectId(ownerId), id);
    if (!deleted) throw new NotFoundException('Patient not found');
  }

  async getClinical(ownerId: string, id: string): Promise<PatientClinicalProfile> {
    const patient = await this.patientsRepository.findByIdForOwner(new Types.ObjectId(ownerId), id);
    if (!patient) throw new NotFoundException('Patient not found');
    return toClinicalProfileDto(patient);
  }

  async updateClinical(
    ownerId: string,
    id: string,
    input: ClinicalProfileUpdateInput,
  ): Promise<PatientClinicalProfile> {
    const patient = await this.patientsRepository.updateClinicalForOwner(
      new Types.ObjectId(ownerId),
      id,
      input,
    );
    if (!patient) throw new NotFoundException('Patient not found');
    return toClinicalProfileDto(patient);
  }
}

/** Lean doc → wire shape. ObjectIds → strings, Dates → ISO; ownerId never leaves. */
function toDto(patient: LeanPatient): PatientDto {
  return {
    id: patient._id.toString(),
    name: patient.name,
    age: patient.age,
    sex: patient.sex,
    language: patient.language,
    phone: patient.phone ?? undefined,
    notes: patient.notes ?? undefined,
    createdAt: patient.createdAt.toISOString(),
    updatedAt: patient.updatedAt.toISOString(),
  };
}

/**
 * Embedded profile → wire shape. Patients without a stored profile (or from
 * before the field existed) get the default-empty one; a never-written
 * profile reports the patient's own timestamp.
 */
function toClinicalProfileDto(patient: LeanPatient): PatientClinicalProfile {
  const clinical = patient.clinical;
  return {
    prakriti: clinical?.prakriti ?? null,
    conditions: clinical?.conditions ?? [],
    regimen: (clinical?.regimen ?? []).map((item) => ({
      name: item.name,
      dose: item.dose ?? undefined,
      schedule: item.schedule ?? undefined,
    })),
    updatedAt: (clinical?.updatedAt ?? patient.updatedAt).toISOString(),
  };
}
