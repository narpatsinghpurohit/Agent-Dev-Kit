import { Injectable, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import type {
  QueueEntry as QueueEntryDto,
  QueueEntryCreateInput,
  QueueEntryUpdateInput,
  QueueListResponse,
} from '@repo/schemas';
import { PatientsService } from '../patients/patients.service';
import { type LeanQueueEntry, QueueRepository } from './queue.repository';

/**
 * The clinic's daily OPD queue: lightweight, owner-scoped appointments for
 * "today". The patient's name is denormalized onto the entry at create so
 * the queue renders without a lookup per row.
 */
@Injectable()
export class QueueService {
  constructor(
    private readonly queueRepository: QueueRepository,
    private readonly patientsService: PatientsService,
  ) {}

  async create(ownerId: string, input: QueueEntryCreateInput): Promise<QueueEntryDto> {
    // Also the ownership check — a foreign patientId 404s here.
    const patient = await this.patientsService.get(ownerId, input.patientId);
    const entry = await this.queueRepository.create(new Types.ObjectId(ownerId), {
      patientId: new Types.ObjectId(input.patientId),
      patientName: patient.name,
      reason: input.reason,
      scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : new Date(),
    });
    return toDto(entry);
  }

  async listToday(ownerId: string): Promise<QueueListResponse> {
    // "Today" = the current UTC calendar day — deliberately simple for the
    // demo. A real clinic queue would use the clinic's local timezone.
    const now = new Date();
    const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const to = new Date(from.getTime() + 24 * 60 * 60 * 1000);
    const entries = await this.queueRepository.findWindowByOwner(
      new Types.ObjectId(ownerId),
      from,
      to,
    );
    return { items: entries.map(toDto) };
  }

  async update(ownerId: string, id: string, input: QueueEntryUpdateInput): Promise<QueueEntryDto> {
    const entry = await this.queueRepository.updateForOwner(new Types.ObjectId(ownerId), id, {
      status: input.status,
      reason: input.reason,
      scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : undefined,
    });
    if (!entry) throw new NotFoundException('Queue entry not found');
    return toDto(entry);
  }

  async delete(ownerId: string, id: string): Promise<void> {
    const deleted = await this.queueRepository.deleteForOwner(new Types.ObjectId(ownerId), id);
    if (!deleted) throw new NotFoundException('Queue entry not found');
  }
}

/** Lean doc → wire shape. ObjectIds → strings, Dates → ISO; ownerId never leaves. */
function toDto(entry: LeanQueueEntry): QueueEntryDto {
  return {
    id: entry._id.toString(),
    patientId: entry.patientId.toString(),
    patientName: entry.patientName,
    reason: entry.reason,
    scheduledAt: entry.scheduledAt.toISOString(),
    status: entry.status,
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
  };
}
