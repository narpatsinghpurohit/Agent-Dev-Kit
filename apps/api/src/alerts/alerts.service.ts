import { Injectable, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import type { AlertsListResponse, OutbreakAlert as OutbreakAlertDto } from '@repo/schemas';
import {
  AlertsRepository,
  type LeanOutbreakAlert,
  type OutbreakAlertSeed,
} from './alerts.repository';

/** Wire cap on `AlertsListResponseSchema.items` — serialization rejects more. */
const MAX_ALERTS = 20;

@Injectable()
export class AlertsService {
  constructor(private readonly alertsRepository: AlertsRepository) {}

  /** Global alerts minus this owner's dismissals, newest first. */
  async list(ownerId: string): Promise<AlertsListResponse> {
    const [alerts, dismissedIds] = await Promise.all([
      this.alertsRepository.findAllNewestFirst(),
      this.alertsRepository.findDismissedAlertIds(new Types.ObjectId(ownerId)),
    ]);
    const dismissed = new Set(dismissedIds.map((id) => id.toString()));
    return {
      items: alerts
        .filter((alert) => !dismissed.has(alert._id.toString()))
        .slice(0, MAX_ALERTS)
        .map(toDto),
    };
  }

  /** Idempotent — a repeat dismiss upserts onto the same dismissal row. */
  async dismiss(ownerId: string, alertId: string): Promise<void> {
    // Alerts are global, so this is pure existence (not ownership) — an
    // unknown id is still a plain 404.
    if (!(await this.alertsRepository.alertExists(alertId))) {
      throw new NotFoundException('Alert not found');
    }
    await this.alertsRepository.upsertDismissal(
      new Types.ObjectId(ownerId),
      new Types.ObjectId(alertId),
    );
  }

  /**
   * Seed hook (src/scripts/seed.ts): upserts each definition by title, so
   * re-running the seed refreshes content without duplicating alerts.
   */
  async ensureSeeded(defs: OutbreakAlertSeed[]): Promise<void> {
    for (const def of defs) {
      await this.alertsRepository.upsertAlertByTitle(def);
    }
  }
}

/** Lean doc → wire shape. ObjectIds → strings, Dates → ISO. */
function toDto(alert: LeanOutbreakAlert): OutbreakAlertDto {
  return {
    id: alert._id.toString(),
    title: alert.title,
    detail: alert.detail,
    caseCount: alert.caseCount,
    radiusKm: alert.radiusKm,
    windowLabel: alert.windowLabel,
    severity: alert.severity,
    createdAt: alert.createdAt.toISOString(),
  };
}
