import { Router } from 'express';

import type { AuthRequest } from '../middleware/auth.js';
import type { TradingSessionRegistry } from '../services/TradingSessionRegistry.js';
import { isTradingSession } from '../services/tradingSession.js';
import { AgentConfigPatchSchema } from '../utils/configSchema.js';

export interface AutotradingSessionsRouterDependencies {
  registry: TradingSessionRegistry;
}

function requireUserId(request: AuthRequest): string {
  if (!request.userId) throw new Error('Authenticated userId is required');
  return request.userId;
}

function paperPositions(registry: TradingSessionRegistry, userId: string) {
  return registry.ensure(userId).state.paperBroker.exportState().positions.map((position) => ({
    symbol: position.symbol,
    qty: position.qty,
    avgCost: position.avgCost,
    currentPrice: position.avgCost,
    unrealizedPnl: 0,
    marketType: position.marketType,
  }));
}

export function createAutotradingSessionsRouter(
  dependencies: AutotradingSessionsRouterDependencies,
) {
  const router = Router();
  const { registry } = dependencies;

  router.get('/status', (request: AuthRequest, response) => {
    const session = registry.ensure(requireUserId(request));
    response.json({
      status: session.state.status,
      config: session.state.config,
      riskStats: {
        ...session.state.riskManager.getStats(),
        lossStreakCount: session.state.lossStreakCount,
      },
    });
  });

  router.post('/status/reset', (request: AuthRequest, response) => {
    registry.ensure(requireUserId(request)).resetCircuitBreaker();
    response.json({ ok: true });
  });

  router.post('/start', async (request: AuthRequest, response, next) => {
    try {
      const parsed = AgentConfigPatchSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return response.status(400).json({
          ok: false,
          error: parsed.error.issues.map((issue) => issue.message).join('; '),
        });
      }
      const session = await registry.start(requireUserId(request), parsed.data);
      return response.json({
        ok: true,
        status: session.state.status,
        config: session.state.config,
      });
    } catch (error) {
      return next(error);
    }
  });

  router.post('/stop', (request: AuthRequest, response) => {
    registry.ensure(requireUserId(request)).stop();
    response.json({ ok: true });
  });

  router.post('/kill-switch', async (request: AuthRequest, response) => {
    await registry.ensure(requireUserId(request)).emergencyKillSwitch();
    response.json({ ok: true });
  });

  router.post('/kill-switch/release', (request: AuthRequest, response) => {
    registry.ensure(requireUserId(request)).deactivateKillSwitch();
    response.json({ ok: true });
  });

  router.get('/config', (request: AuthRequest, response) => {
    response.json(registry.ensure(requireUserId(request)).state.config);
  });

  router.put('/config', async (request: AuthRequest, response, next) => {
    try {
      const parsed = AgentConfigPatchSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return response.status(400).json({
          ok: false,
          error: parsed.error.issues.map((issue) => issue.message).join('; '),
        });
      }
      const session = await registry.update(requireUserId(request), parsed.data);
      return response.json({ ok: true, config: session.state.config });
    } catch (error) {
      return next(error);
    }
  });

  router.get('/logs', (request: AuthRequest, response) => {
    const requested = Number(request.query.limit ?? 100);
    const limit = Number.isFinite(requested) ? Math.max(0, Math.min(1_000, requested)) : 100;
    response.json(registry.ensure(requireUserId(request)).state.logs(limit));
  });

  router.get('/positions', (request: AuthRequest, response) => {
    const userId = requireUserId(request);
    response.json(paperPositions(registry, userId));
  });

  router.get('/balance', (request: AuthRequest, response) => {
    const session = registry.ensure(requireUserId(request));
    const broker = session.state.paperBroker.exportState();
    const positionsValue = broker.positions.reduce(
      (sum, position) => sum + position.qty * position.avgCost,
      0,
    );
    response.json({
      totalAssets: broker.balance + positionsValue,
      availableMargin: broker.balance,
      usedMargin: positionsValue,
      dailyPnl: broker.dailyPnl,
      currency: 'TWD',
    });
  });

  router.get('/session', (request: AuthRequest, response) => {
    const session = registry.ensure(requireUserId(request));
    const symbols = String(request.query.symbols ?? '2330.TW')
      .split(',')
      .map((symbol) => symbol.trim())
      .filter(Boolean);
    response.json({
      ok: true,
      sessions: symbols.map((symbol) => ({
        symbol,
        ...isTradingSession(symbol, session.state.config.tradingHours),
      })),
    });
  });

  router.get('/broker/status', (request: AuthRequest, response) => {
    const session = registry.ensure(requireUserId(request));
    response.json({
      ok: true,
      config: {
        brokerId: 'simulated',
        accountId: '',
        mode: 'simulated',
      },
      connected: session.state.paperBroker.isConnected,
      liveAvailable: false,
    });
  });

  router.post('/broker/connect', async (request: AuthRequest, response) => {
    const userId = requireUserId(request);
    if (request.body?.brokerId !== 'simulated' || request.body?.mode === 'real') {
      return response.status(409).json({
        ok: false,
        message: '真實券商 adapter 尚未完成完整沙盒驗證；目前僅允許 simulated。',
      });
    }
    const result = await registry.ensure(userId).state.paperBroker.connect({
      brokerId: 'simulated',
      mode: 'simulated',
    });
    return response.json(result);
  });

  return router;
}
