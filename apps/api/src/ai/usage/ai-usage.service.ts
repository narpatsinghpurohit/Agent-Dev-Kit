import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { Env } from '../../config/env.schema';
import { AiBudgetDay, AiUsage } from './ai-usage.schema';

export interface UsageTotals {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

function asFiniteNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export interface BudgetReservation {
  /** Reconcile with actuals (refunds the unused reservation). Always call it. */
  settle(actual: UsageTotals | null, meta: SettleMeta): Promise<void>;
}

interface SettleMeta {
  feature: string;
  model: string;
  latencyMs?: number;
  finishReason?: string;
  promptVersion?: string;
}

/**
 * Two-phase token budgeting: atomically reserve an estimate before the model
 * call (409-free: a single findOneAndUpdate with an $expr cap check), then
 * settle with the real totalUsage afterwards. Per-feature maxOutputTokens is
 * the per-request ceiling; this is the per-user daily ceiling.
 */
@Injectable()
export class AiUsageService {
  private readonly logger = new Logger(AiUsageService.name);

  constructor(
    @InjectModel(AiUsage.name) private readonly usage: Model<AiUsage>,
    @InjectModel(AiBudgetDay.name) private readonly budget: Model<AiBudgetDay>,
    private readonly configService: ConfigService<Env, true>,
  ) {}

  async reserve(userId: string, estimatedTokens: number): Promise<BudgetReservation> {
    const dailyBudget = this.configService.get('AI_DAILY_TOKEN_BUDGET', { infer: true });
    const owner = new Types.ObjectId(userId);
    const day = new Date().toISOString().slice(0, 10);

    // Ensure the day document exists (idempotent upsert)…
    await this.budget
      .updateOne(
        { userId: owner, day },
        {
          $setOnInsert: {
            used: 0,
            reserved: 0,
            expiresAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
          },
        },
        { upsert: true },
      )
      .catch((error: { code?: number }) => {
        if (error.code !== 11000) throw error; // concurrent upsert race
      });

    // …then atomically reserve only if the cap holds.
    const reserved = await this.budget.findOneAndUpdate(
      {
        userId: owner,
        day,
        $expr: { $lte: [{ $add: ['$used', '$reserved', estimatedTokens] }, dailyBudget] },
      },
      { $inc: { reserved: estimatedTokens } },
      { returnDocument: 'after' },
    );

    if (!reserved) {
      throw new HttpException(
        `Daily AI token budget (${dailyBudget}) exhausted — try again tomorrow or raise AI_DAILY_TOKEN_BUDGET.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return {
      settle: async (actual, meta) => {
        const usedTokens = actual?.totalTokens ?? 0;
        await this.budget.updateOne(
          { userId: owner, day },
          { $inc: { reserved: -estimatedTokens, used: usedTokens } },
        );
        if (actual) {
          await this.usage.create({
            userId: owner,
            feature: meta.feature,
            model: meta.model,
            inputTokens: actual.inputTokens,
            outputTokens: actual.outputTokens,
            totalTokens: actual.totalTokens,
            latencyMs: meta.latencyMs,
            finishReason: meta.finishReason,
            promptVersion: meta.promptVersion,
          });
        }
      },
    };
  }

  /**
   * streamText totalUsage → flat numbers. Defensive: fields may be undefined,
   * and providers running through compat layers have produced non-numeric
   * shapes — never let NaN/strings reach the budget math.
   */
  static toTotals(usage: {
    inputTokens?: { total?: number } | number;
    outputTokens?: { total?: number } | number;
    totalTokens?: number;
  }): UsageTotals {
    const input = asFiniteNumber(
      typeof usage.inputTokens === 'number' ? usage.inputTokens : usage.inputTokens?.total,
    );
    const output = asFiniteNumber(
      typeof usage.outputTokens === 'number' ? usage.outputTokens : usage.outputTokens?.total,
    );
    const total = asFiniteNumber(usage.totalTokens);
    return {
      inputTokens: input,
      outputTokens: output,
      totalTokens: total > 0 ? total : input + output,
    };
  }
}
