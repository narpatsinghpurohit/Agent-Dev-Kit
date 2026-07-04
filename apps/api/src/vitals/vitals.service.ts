import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import type {
  Vital as VitalDto,
  VitalCreateInput,
  VitalTrend,
  VitalsListResponse,
} from '@repo/schemas';
import { PatientsService } from '../patients/patients.service';
import { type LeanVital, VitalsRepository } from './vitals.repository';

const DAY_MS = 86_400_000;
/** bp/pulse trends look at the last N readings that carry the metric. */
const SERIES_LOOKBACK = 3;
/** Weight compares oldest vs latest reading inside this window. */
const WEIGHT_WINDOW_DAYS = 90;
/** Weight deltas below this are noise, not a trend. */
const WEIGHT_FLAT_DELTA_KG = 0.5;

/**
 * Vital-signs readings per patient, plus server-derived trend lines
 * (`↑ 3 visits rising`, `↓ 1.5 kg / 2 mo`) so every client renders the
 * same clinical interpretation.
 */
@Injectable()
export class VitalsService {
  constructor(
    private readonly vitalsRepository: VitalsRepository,
    private readonly patientsService: PatientsService,
  ) {}

  async create(ownerId: string, patientId: string, input: VitalCreateInput): Promise<VitalDto> {
    // Also the ownership check — a foreign patientId 404s here.
    await this.patientsService.get(ownerId, patientId);
    const vital = await this.vitalsRepository.create(new Types.ObjectId(ownerId), {
      patientId: new Types.ObjectId(patientId),
      systolic: input.systolic ?? null,
      diastolic: input.diastolic ?? null,
      pulse: input.pulse ?? null,
      weightKg: input.weightKg ?? null,
      takenAt: input.takenAt ? new Date(input.takenAt) : new Date(),
      takenBy: input.takenBy,
    });
    return toDto(vital);
  }

  async list(ownerId: string, patientId: string): Promise<VitalsListResponse> {
    // Also the ownership check — a foreign patientId 404s here.
    await this.patientsService.get(ownerId, patientId);
    const readings = await this.vitalsRepository.findAllForPatient(
      new Types.ObjectId(ownerId),
      new Types.ObjectId(patientId),
    );
    return { items: readings.map(toDto), trends: deriveTrends(readings) };
  }
}

/**
 * At most one trend per metric, and only for metrics that have enough data:
 * - bp / pulse: strictly monotonic across the last 3 readings carrying the
 *   metric (2 suffice) → up/down; otherwise flat. Fewer than 2 → no trend.
 * - weight: oldest vs latest reading inside the last 90 days; a delta under
 *   0.5 kg is flat. Fewer than 2 in-window readings → no trend.
 *
 * Input is newest-first (the repository's order); exported for unit tests.
 */
export function deriveTrends(newestFirst: LeanVital[], now = new Date()): VitalTrend[] {
  const chronological = [...newestFirst].reverse();
  const trends: VitalTrend[] = [];

  const bp = seriesTrend(
    'bp',
    chronological.map((reading) => reading.systolic),
  );
  if (bp) trends.push(bp);

  const pulse = seriesTrend(
    'pulse',
    chronological.map((reading) => reading.pulse),
  );
  if (pulse) trends.push(pulse);

  const weight = weightTrend(chronological, now);
  if (weight) trends.push(weight);

  return trends;
}

/** Strictly-monotonic check over the last few non-null values (chronological). */
function seriesTrend(metric: 'bp' | 'pulse', values: (number | null)[]): VitalTrend | null {
  const series = values.filter((value): value is number => value != null).slice(-SERIES_LOOKBACK);
  if (series.length < 2) return null;
  const rising = series.every((value, i) => i === 0 || value > series[i - 1]!);
  const falling = series.every((value, i) => i === 0 || value < series[i - 1]!);
  if (rising) return { metric, direction: 'up', label: `↑ ${series.length} visits rising` };
  if (falling) return { metric, direction: 'down', label: `↓ ${series.length} visits falling` };
  return { metric, direction: 'flat', label: 'stable' };
}

function weightTrend(chronological: LeanVital[], now: Date): VitalTrend | null {
  const windowStart = now.getTime() - WEIGHT_WINDOW_DAYS * DAY_MS;
  const inWindow: { kg: number; at: number }[] = [];
  for (const reading of chronological) {
    if (reading.weightKg != null && reading.takenAt.getTime() >= windowStart) {
      inWindow.push({ kg: reading.weightKg, at: reading.takenAt.getTime() });
    }
  }
  if (inWindow.length < 2) return null;

  const oldest = inWindow[0]!;
  const latest = inWindow[inWindow.length - 1]!;
  const delta = latest.kg - oldest.kg;
  if (Math.abs(delta) < WEIGHT_FLAT_DELTA_KG) {
    return { metric: 'weight', direction: 'flat', label: 'stable' };
  }
  const arrow = delta < 0 ? '↓' : '↑';
  return {
    metric: 'weight',
    direction: delta < 0 ? 'down' : 'up',
    label: `${arrow} ${formatKg(Math.abs(delta))} kg / ${formatSpan(latest.at - oldest.at)}`,
  };
}

/** 1.50 → `1.5`, 2.00 → `2` — no trailing zeros in the label. */
function formatKg(kg: number): string {
  const rounded = Math.round(kg * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

/** Coarse span for the label: `2 mo` / `3 wk` / `5 d`. */
function formatSpan(ms: number): string {
  const days = Math.max(1, Math.round(ms / DAY_MS));
  if (days >= 30) return `${Math.round(days / 30)} mo`;
  if (days >= 7) return `${Math.round(days / 7)} wk`;
  return `${days} d`;
}

/** Lean doc → wire shape. ObjectIds → strings, Dates → ISO; ownerId never leaves. */
function toDto(vital: LeanVital): VitalDto {
  return {
    id: vital._id.toString(),
    patientId: vital.patientId.toString(),
    systolic: vital.systolic ?? null,
    diastolic: vital.diastolic ?? null,
    pulse: vital.pulse ?? null,
    weightKg: vital.weightKg ?? null,
    takenAt: vital.takenAt.toISOString(),
    takenBy: vital.takenBy,
    createdAt: vital.createdAt.toISOString(),
  };
}
