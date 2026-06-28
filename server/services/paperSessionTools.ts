import { tradingSessionRegistry } from './tradingSessionRegistryInstance.js';
import { getStrategyRuntimeService } from './strategyRuntimeService.js';

function sessionView(userId: string) {
  const session = tradingSessionRegistry.ensure(userId);
  return {
    sessionId: userId,
    status: session.state.status,
    paperOnly: true,
    config: {
      mode: 'simulated',
      strategyVersionId: session.state.config.strategyVersionId,
      symbols: [...session.state.config.symbols],
      tickIntervalMs: session.state.config.tickIntervalMs,
    },
    risk: {
      ...session.state.riskManager.getStats(),
      lossStreakCount: session.state.lossStreakCount,
    },
    positions: session.state.paperBroker.exportState().positions,
  };
}

export async function startPaperStrategy(
  userId: string,
  input: {
    ticker: string;
    strategyVersionId: string;
    paperOnly: true;
  },
) {
  await getStrategyRuntimeService().assertPaperExecutableVersion(
    userId,
    input.strategyVersionId,
  );
  await tradingSessionRegistry.start(userId, {
    mode: 'simulated',
    symbols: [input.ticker],
    strategyVersionId: input.strategyVersionId,
  });
  return sessionView(userId);
}

export async function stopPaperStrategy(userId: string) {
  tradingSessionRegistry.ensure(userId).stop();
  return sessionView(userId);
}

export async function inspectPaperSession(userId: string) {
  return sessionView(userId);
}

export async function inspectPaperOrders(userId: string) {
  const session = tradingSessionRegistry.ensure(userId);
  return {
    sessionId: userId,
    paperOnly: true,
    openOrders: await session.state.paperBroker.getOpenOrders(),
    positions: session.state.paperBroker.exportState().positions,
  };
}
