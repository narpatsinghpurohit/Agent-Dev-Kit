import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import type { AlertSeverity } from '@repo/schemas';

/**
 * GLOBAL reference data — deliberately NO `ownerId`, the one exception to the
 * ownership-as-query-predicate rule: outbreak advisories are seeded, shared
 * reading material for every doctor, not per-tenant records. The per-user
 * layer is AlertDismissal below, which IS owner-scoped as usual.
 */
@Schema({ collection: 'outbreak_alerts' })
export class OutbreakAlert {
  /** Seed upsert key (`ensureSeeded` matches on it) — re-seeding never duplicates. */
  @Prop({ required: true, unique: true, trim: true })
  title: string;

  @Prop({ required: true })
  detail: string;

  @Prop({ type: Number, default: null })
  caseCount: number | null;

  @Prop({ type: Number, default: null })
  radiusKm: number | null;

  /** Human time window, e.g. `last 14 days`. */
  @Prop({ required: true })
  windowLabel: string;

  @Prop({ type: String, enum: ['info', 'watch', 'warning'], required: true })
  severity: AlertSeverity;

  // Explicit rather than { timestamps: true }: the wire shape has no
  // updatedAt, and the seed may backdate createdAt for a stable order.
  @Prop({ default: () => new Date() })
  createdAt: Date;
}

export type OutbreakAlertDocument = HydratedDocument<OutbreakAlert>;
export const OutbreakAlertSchema = SchemaFactory.createForClass(OutbreakAlert);

// The dashboard list reads newest first.
OutbreakAlertSchema.index({ createdAt: -1 });

/** One row per (owner, alert) — "this doctor dismissed this advisory". */
@Schema({ collection: 'alert_dismissals' })
export class AlertDismissal {
  @Prop({ type: Types.ObjectId, required: true })
  ownerId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  alertId: Types.ObjectId;
}

export type AlertDismissalDocument = HydratedDocument<AlertDismissal>;
export const AlertDismissalSchema = SchemaFactory.createForClass(AlertDismissal);

// Idempotency anchor: a duplicate dismiss upserts onto the same row.
AlertDismissalSchema.index({ ownerId: 1, alertId: 1 }, { unique: true });
