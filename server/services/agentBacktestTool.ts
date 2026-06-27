import { z } from 'zod';
import {
  getStrategyRuntimeService,
  type StartBacktestCommand,
} from './strategyRuntimeService.js';

interface AgentBacktestService {
  startBacktest(
    userId: string,
    command: StartBacktestCommand,
  ): Promise<{ id: string; status: string }>;
}

const AgentBacktestArgsSchema = z.object({
  strategyVersionId: z.string().min(1),
  ticker: z.string().trim().min(1).max(64),
  initialCapital: z.number().positive().optional(),
  startDate: z.string().min(1).optional(),
  endDate: z.string().min(1).optional(),
});

export async function queueAgentBacktest(
  userId: string,
  args: Record<string, unknown>,
  service: AgentBacktestService = getStrategyRuntimeService(),
): Promise<{ jobId: string; status: string }> {
  const parsed = AgentBacktestArgsSchema.parse(args);
  const command: StartBacktestCommand = {
    strategyVersionId: parsed.strategyVersionId,
    symbol: parsed.ticker,
    period1: parsed.startDate,
    period2: parsed.endDate,
    execution: parsed.initialCapital
      ? { initialCapital: parsed.initialCapital }
      : undefined,
  };
  const job = await service.startBacktest(userId, command);
  return { jobId: job.id, status: job.status };
}
