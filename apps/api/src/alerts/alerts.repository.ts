import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { AlertSeverity } from '@repo/schemas';
import { AlertDismissal, OutbreakAlert } from './alert.schema';

export type LeanOutbreakAlert = OutbreakAlert & { _id: Types.ObjectId };

/** Seed definition for `ensureSeeded`; `createdAt` may backdate for a stable order. */
export interface OutbreakAlertSeed {
  title: string;
  detail: string;
  caseCount: number | null;
  radiusKm: number | null;
  windowLabel: string;
  severity: AlertSeverity;
  createdAt?: Date;
}

/**
 * Alert reads deliberately carry no `ownerId` — alerts are global seeded
 * reference data (see alert.schema.ts for why this is the exception to the
 * ownership rule). Dismissal queries, the per-user layer, keep the usual
 * ownership predicate.
 */
@Injectable()
export class AlertsRepository {
  constructor(
    @InjectModel(OutbreakAlert.name) private readonly alerts: Model<OutbreakAlert>,
    @InjectModel(AlertDismissal.name) private readonly dismissals: Model<AlertDismissal>,
  ) {}

  async findAllNewestFirst(): Promise<LeanOutbreakAlert[]> {
    // `_id` tiebreak keeps the order stable when seeded rows share a createdAt.
    return this.alerts.find({}).sort({ createdAt: -1, _id: -1 }).lean();
  }

  async alertExists(id: string): Promise<boolean> {
    if (!Types.ObjectId.isValid(id)) return false;
    return (await this.alerts.exists({ _id: new Types.ObjectId(id) })) !== null;
  }

  async findDismissedAlertIds(ownerId: Types.ObjectId): Promise<Types.ObjectId[]> {
    const rows = await this.dismissals.find({ ownerId }).select('alertId').lean();
    return rows.map((row) => row.alertId);
  }

  /** Duplicate dismiss lands on the same row — POST /alerts/:id/dismiss stays idempotent. */
  async upsertDismissal(ownerId: Types.ObjectId, alertId: Types.ObjectId): Promise<void> {
    await this.dismissals
      .updateOne({ ownerId, alertId }, { $setOnInsert: { ownerId, alertId } }, { upsert: true })
      .catch((error: { code?: number }) => {
        if (error.code !== 11000) throw error; // concurrent upsert race — already dismissed
      });
  }

  /** Insert-or-refresh by title; `createdAt` is only ever set on first insert. */
  async upsertAlertByTitle(def: OutbreakAlertSeed): Promise<void> {
    const { title, createdAt, ...content } = def;
    await this.alerts.updateOne(
      { title },
      { $set: content, $setOnInsert: { createdAt: createdAt ?? new Date() } },
      { upsert: true },
    );
  }
}
