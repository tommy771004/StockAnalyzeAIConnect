import type {
  AgentConfig,
  AgentLog,
} from '../../src/components/AutoTrading/types.js';
import {
  OrderExecutor,
  type ExecutionDataProvenance,
  type OrderLifecycleEvent,
} from './orderExecutor.js';
import { sectorOf } from './sectorMap.js';
import { anyMarketOpen } from './tradingSession.js';
import {
  TradingSessionState,
  type TradingSessionSnapshot,
} from './tradingSessionState.js';

export interface SessionAnalysisSignal {
  action: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  price?: number;
  prevClose?: number;
  _analysisError?: boolean;
  quantumForcedLiquidation?: boolean;
  defensiveMode?: boolean;
  decisionId?: string;
  evidenceIds?: string[];
  marketTimestamp?: string;
  dataProvenance?: ExecutionDataProvenance;
  maxDataAgeMs?: number;
}

export interface AutonomousTradingSessionDependencies {
  analyze?: (input: {
    userId: string;
    config: AgentConfig;
    symbol: string;
  }) => Promise<SessionAnalysisSignal>;
  persist?: (snapshot: TradingSessionSnapshot) => Promise<void>;
  publish?: (event: { type: string; data: unknown }) => void;
  isMarketOpen?: (config: AgentConfig) => boolean;
}

type StartOptions = { runImmediately?: boolean };

function mergeConfig(base: AgentConfig, patch?: Partial<AgentConfig>): AgentConfig {
  if (!patch) return structuredClone(base);
  return {
    ...structuredClone(base),
    ...structuredClone(patch),
    params: {
      ...structuredClone(base.params),
      ...structuredClone(patch.params ?? {}),
    },
    circuitBreaker: patch.circuitBreaker
      ? { ...base.circuitBreaker, ...patch.circuitBreaker }
      : structuredClone(base.circuitBreaker),
    hedgeConfig: patch.hedgeConfig
      ? { ...base.hedgeConfig, ...patch.hedgeConfig }
      : structuredClone(base.hedgeConfig),
    userId: base.userId,
  };
}

export class AutonomousTradingSession {
  private readonly analyze: NonNullable<AutonomousTradingSessionDependencies['analyze']>;
  private readonly persist: NonNullable<AutonomousTradingSessionDependencies['persist']>;
  private readonly publish: NonNullable<AutonomousTradingSessionDependencies['publish']>;
  private readonly isMarketOpen: NonNullable<AutonomousTradingSessionDependencies['isMarketOpen']>;
  private readonly executor: OrderExecutor;
  private persistChain: Promise<void> = Promise.resolve();

  constructor(
    readonly state: TradingSessionState,
    dependencies: AutonomousTradingSessionDependencies = {},
  ) {
    this.analyze = dependencies.analyze ?? ((input) => this.runDefaultAnalysis(input));
    this.persist = dependencies.persist ?? (async () => undefined);
    this.publish = dependencies.publish ?? (() => undefined);
    this.isMarketOpen = dependencies.isMarketOpen
      ?? ((config) => anyMarketOpen(config.symbols, config.tradingHours));
    this.executor = new OrderExecutor(
      state.paperBroker,
      state.paperBroker,
      (log) => this.emitLog(log),
      (event) => this.handleOrderLifecycle(event),
      { enableCopyTrading: false },
    );
  }

  async start(
    config?: Partial<AgentConfig>,
    options: StartOptions = {},
  ): Promise<{ ok: true; mode: 'simulated' }> {
    this.clearTimer();
    this.state.config = mergeConfig(this.state.config, config);
    if (this.state.config.mode === 'real') {
      this.state.config.mode = 'simulated';
      this.emitLog({
        level: 'CRITICAL',
        source: 'RISK',
        symbol: 'ALL',
        message: '實盤 adapter 尚未通過沙盒驗證；本工作階段已強制降級為模擬交易。',
      });
    }

    await this.state.paperBroker.connect({
      brokerId: 'simulated',
      mode: 'simulated',
    });
    this.state.riskManager.updateConfig({
      budgetLimitTWD: this.state.config.budgetLimitTWD,
      maxDailyLossTWD: this.state.config.maxDailyLossTWD,
      stopLossPct: (this.state.config.params.stopLossPct ?? 5) / 100,
    });
    this.state.status = 'running';
    this.emitLog({
      level: 'SYSTEM',
      source: 'AGENT',
      symbol: 'ALL',
      message: `使用者 ${this.state.userId} 的模擬交易工作階段已啟動。`,
    });
    await this.persistState();

    if (options.runImmediately === false) this.scheduleNextTick();
    else void this.runTick();
    return { ok: true, mode: 'simulated' };
  }

  stop(): void {
    this.clearTimer();
    this.state.status = 'stopped';
    this.state.cooldownUntil = null;
    this.state.endTick();
    this.emitLog({
      level: 'SYSTEM',
      source: 'AGENT',
      symbol: 'ALL',
      message: '模擬交易工作階段已停止。',
    });
    void this.persistState();
  }

  isTickRunning(): boolean {
    return this.state.isTickRunning();
  }

  async runTick(): Promise<boolean> {
    if (this.state.status !== 'running') return false;
    if (!this.state.beginTick()) return false;

    this.clearTimer();
    try {
      this.reconcilePaperPositions();
      if (this.state.riskManager.isKillSwitchActive()) {
        this.emitLog({
          level: 'CRITICAL',
          source: 'RISK',
          symbol: 'ALL',
          message: 'Kill Switch 已啟動，本輪不執行任何委託。',
        });
        return true;
      }
      if (!this.isMarketOpen(this.state.config)) {
        this.emitLog({
          level: 'MONITOR',
          source: 'SESSION',
          symbol: 'ALL',
          message: '所有監控標的目前皆不在交易時段，本輪只保存狀態。',
        });
        return true;
      }

      for (const symbol of this.state.config.symbols) {
        const signal = await this.analyze({
          userId: this.state.userId,
          config: structuredClone(this.state.config),
          symbol,
        });
        this.emitLog({
          level: signal._analysisError ? 'ERROR' : 'MONITOR',
          source: 'ANALYSIS',
          symbol,
          message: signal._analysisError
            ? '分析失敗，本輪不視為 HOLD。'
            : `決策 ${signal.action} / 信心度 ${signal.confidence.toFixed(1)}`,
          confidence: signal.confidence,
          action: signal.action,
        });
        if (signal._analysisError) continue;
        await this.executeSignal(symbol, { ...signal });
        if (this.state.status !== 'running') break;
      }
      return true;
    } catch (error) {
      this.emitLog({
        level: 'ERROR',
        source: 'SYSTEM',
        symbol: 'ENGINE',
        message: `Tick 異常: ${error instanceof Error ? error.message : String(error)}`,
      });
      return true;
    } finally {
      this.state.endTick();
      await this.persistState();
      if (this.state.status === 'running') this.scheduleNextTick();
    }
  }

  activateCooldown(reason: string): void {
    this.clearTimer();
    this.state.status = 'cooldown';
    const cooldownMs = (this.state.config.circuitBreaker?.cooldownMinutes ?? 60) * 60_000;
    this.state.cooldownUntil = new Date(Date.now() + cooldownMs).toISOString();
    this.emitLog({
      level: 'CRITICAL',
      source: 'BREAKER',
      symbol: 'ALL',
      message: `斷路器觸發：${reason}。此使用者的模擬交易已暫停。`,
    });
    void this.persistState();
    this.scheduleCooldownResume(cooldownMs);
  }

  resetCircuitBreaker(): void {
    this.state.lossStreakCount = 0;
    if (this.state.status === 'cooldown') {
      this.state.status = 'running';
      this.state.cooldownUntil = null;
      void this.runTick();
    }
    void this.persistState();
  }

  async emergencyKillSwitch(): Promise<void> {
    this.state.riskManager.activateKillSwitch();
    this.state.status = 'paused';
    this.clearTimer();
    this.emitLog({
      level: 'CRITICAL',
      source: 'RISK',
      symbol: 'ALL',
      message: '此使用者的 Kill Switch 已啟動。',
    });
    for (const position of this.state.paperBroker.exportState().positions) {
      const result = await this.state.paperBroker.placeOrder({
        symbol: position.symbol,
        side: 'SELL',
        qty: position.qty,
        price: position.avgCost,
        orderType: 'MARKET',
        marketType: position.marketType,
        note: 'user-scoped kill switch liquidation',
      });
      if (result.status === 'FILLED') {
        this.state.posTrack.delete(position.symbol);
        this.state.peakPriceTrack.delete(position.symbol);
        this.emitLog({
          level: 'CRITICAL',
          source: 'KILL',
          symbol: position.symbol,
          message: `Kill Switch 已清空 ${result.filledQty} 單位模擬部位。`,
        });
      } else {
        this.emitLog({
          level: 'ERROR',
          source: 'KILL',
          symbol: position.symbol,
          message: `Kill Switch 清倉失敗：${result.message ?? result.status}`,
        });
      }
    }
    await this.persistState();
  }

  deactivateKillSwitch(): void {
    this.state.riskManager.deactivateKillSwitch();
    if (this.state.status === 'paused') this.state.status = 'stopped';
    void this.persistState();
  }

  async resume(options: StartOptions = {}): Promise<void> {
    await this.state.paperBroker.connect({
      brokerId: 'simulated',
      mode: 'simulated',
    });
    if (this.state.status === 'running') {
      if (options.runImmediately === false) this.scheduleNextTick();
      else void this.runTick();
      return;
    }
    if (this.state.status === 'cooldown') {
      const until = this.state.cooldownUntil
        ? new Date(this.state.cooldownUntil).getTime()
        : Date.now();
      this.scheduleCooldownResume(Math.max(0, until - Date.now()));
    }
  }

  private async executeSignal(symbol: string, signal: SessionAnalysisSignal): Promise<void> {
    const price = Number(signal.price ?? 0);
    if (!Number.isFinite(price) || price <= 0) return;
    if (signal.marketTimestamp) {
      const marketTime = new Date(signal.marketTimestamp).getTime();
      const maxAge = signal.maxDataAgeMs
        ?? this.state.riskManager.getModelRisk().dataFreshnessThresholdMs;
      if (!Number.isFinite(marketTime) || Date.now() - marketTime > maxAge) {
        this.emitLog({
          level: 'RISK_CHK',
          source: 'STALE_DATA',
          symbol,
          message: `市場資料超過新鮮度上限 ${Math.round(maxAge / 1_000)} 秒，拒絕建立委託。`,
        });
        return;
      }
    }

    const tracked = this.state.posTrack.get(symbol);
    if (tracked?.qty && tracked.avgCost > 0 && signal.action !== 'SELL') {
      const peak = Math.max(this.state.peakPriceTrack.get(symbol) ?? price, price);
      this.state.peakPriceTrack.set(symbol, peak);
      const pnlFraction = (price - tracked.avgCost) / tracked.avgCost;
      const trailingDrawdown = (peak - price) / peak;
      const stopLossPct = (this.state.config.params.stopLossPct ?? 5) / 100;
      const trailingStopPct = (this.state.config.params.trailingStopPct ?? 3) / 100;
      const takeProfitPct = (this.state.config.params.takeProfitPct ?? 10) / 100;

      if (pnlFraction <= -stopLossPct) {
        signal.action = 'SELL';
        signal.confidence = 100;
        this.emitLog({
          level: 'RISK_CHK',
          source: 'STOP_LOSS',
          symbol,
          message: `主動停損：現價 ${price.toFixed(2)} / 均成本 ${tracked.avgCost.toFixed(2)}`,
        });
      } else if (peak > tracked.avgCost && trailingDrawdown >= trailingStopPct) {
        signal.action = 'SELL';
        signal.confidence = 100;
        this.emitLog({
          level: 'RISK_CHK',
          source: 'TRAILING_STOP',
          symbol,
          message: `追蹤停損：現價 ${price.toFixed(2)} / 峰值 ${peak.toFixed(2)}`,
        });
      } else if (pnlFraction >= takeProfitPct) {
        signal.action = 'SELL';
        signal.confidence = 100;
        this.emitLog({
          level: 'RISK_CHK',
          source: 'TAKE_PROFIT',
          symbol,
          message: `停利：現價 ${price.toFixed(2)} / 均成本 ${tracked.avgCost.toFixed(2)}`,
        });
      }
    }

    if (tracked?.qty && signal.quantumForcedLiquidation) {
      signal.action = 'SELL';
      signal.confidence = 100;
      this.emitLog({
        level: 'CRITICAL',
        source: 'QUANTUM',
        symbol,
        message: '量子 regime 風險達強制平倉門檻。',
      });
    }

    if (signal.action === 'HOLD') return;
    const threshold = this.state.config.params.AI_LLM?.confidenceThreshold ?? 65;
    const defensiveThreshold = signal.defensiveMode ? threshold + 12 : threshold;
    if (signal.confidence <= defensiveThreshold && signal.confidence !== 100) return;
    if (signal.defensiveMode && signal.action === 'BUY') return;

    const brokerState = this.state.paperBroker.exportState();
    const portfolioValue = Array.from(this.state.posTrack.values())
      .reduce((sum, position) => sum + position.qty * position.avgCost, 0);
    const totalAssets = brokerState.balance + portfolioValue;
    const qty = signal.action === 'SELL'
      ? (this.state.posTrack.get(symbol)?.qty ?? 0)
      : this.calculateBuyQuantity(symbol, price, brokerState.balance);
    if (qty <= 0) return;

    const positions = Array.from(this.state.posTrack, ([heldSymbol, position]) => ({
      symbol: heldSymbol,
      value: position.qty * position.avgCost,
      sector: sectorOf(heldSymbol),
    }));
    const risk = this.state.riskManager.validateOrder(
      { symbol, side: signal.action, quantity: qty, price },
      totalAssets,
      { positions, newSymbolSector: sectorOf(symbol) },
    );
    if (!risk.allowed) {
      this.emitLog({
        level: 'RISK_CHK',
        source: 'RISK',
        symbol,
        message: `風控攔截：${risk.reason}`,
      });
      return;
    }

    const result = await this.executor.executeTrade(this.state.config, {
      symbol,
      side: signal.action,
      qty,
      price,
    }, {
      userId: this.state.userId,
      strategyVersionId: this.state.config.strategyVersionId ?? 'legacy-unversioned',
      decisionId: signal.decisionId ?? `${this.state.userId}-${Date.now()}-${symbol}`,
      evidenceIds: [...(signal.evidenceIds ?? [])],
      dataProvenance: signal.dataProvenance ?? {
        providerId: 'legacy-analysis',
        retrievedAt: new Date().toISOString(),
        marketTimestamp: signal.marketTimestamp,
        delayed: false,
      },
    });
    if (!result || (result.status !== 'FILLED' && result.status !== 'PARTIAL')) return;
    this.applyFill(symbol, signal.action, result.filledQty, result.filledPrice);
  }

  private calculateBuyQuantity(symbol: string, price: number, available: number): number {
    const configured = this.state.config.params.maxAllocationPerTrade ?? 0.1;
    const maxAmount = configured <= 1
      ? this.state.config.budgetLimitTWD * configured
      : configured;
    const amount = Math.min(available * 0.1, maxAmount);
    if (/\.(TW|TWO)$/i.test(symbol)) {
      return Math.floor(amount / (price * 1_000)) * 1_000;
    }
    return Math.floor((amount / price) * 1_000) / 1_000;
  }

  private applyFill(
    symbol: string,
    side: 'BUY' | 'SELL',
    filledQty: number,
    filledPrice: number,
  ): void {
    const tracked = this.state.posTrack.get(symbol) ?? { avgCost: 0, qty: 0 };
    this.state.riskManager.recordTrade(filledQty * filledPrice);
    if (side === 'BUY') {
      const qty = tracked.qty + filledQty;
      const avgCost = qty > 0
        ? (tracked.qty * tracked.avgCost + filledQty * filledPrice) / qty
        : 0;
      this.state.posTrack.set(symbol, { qty, avgCost });
      return;
    }

    const pnl = (filledPrice - tracked.avgCost) * filledQty;
    this.state.riskManager.recordPnl(pnl);
    this.state.lossStreakCount = pnl < 0 ? this.state.lossStreakCount + 1 : 0;
    const remaining = Math.max(0, tracked.qty - filledQty);
    if (remaining === 0) {
      this.state.posTrack.delete(symbol);
      this.state.peakPriceTrack.delete(symbol);
    } else {
      this.state.posTrack.set(symbol, { ...tracked, qty: remaining });
    }
  }

  private reconcilePaperPositions(): void {
    const positions = this.state.paperBroker.exportState().positions;
    if (positions.length === 0 && this.state.posTrack.size > 0) {
      this.emitLog({
        level: 'WARNING',
        source: 'RECONCILE',
        symbol: 'ALL',
        message: '券商回傳空庫存，保留本地受保護的均成本與持倉狀態。',
      });
      return;
    }
    for (const position of positions) {
      this.state.posTrack.set(position.symbol, {
        qty: position.qty,
        avgCost: position.avgCost,
      });
    }
    const brokerSymbols = new Set(positions.map((position) => position.symbol));
    for (const symbol of this.state.posTrack.keys()) {
      if (!brokerSymbols.has(symbol)) {
        this.state.posTrack.delete(symbol);
        this.state.peakPriceTrack.delete(symbol);
      }
    }
  }

  private handleOrderLifecycle(event: OrderLifecycleEvent): void {
    this.publish({
      type: 'order_lifecycle',
      data: {
        userId: this.state.userId,
        ...event,
      },
    });
  }

  private async runDefaultAnalysis(input: {
    userId: string;
    config: AgentConfig;
    symbol: string;
  }): Promise<SessionAnalysisSignal> {
    if (input.config.strategyVersionId) {
      const { getStrategyRuntimeService } = await import('./strategyRuntimeService.js');
      const signal = await getStrategyRuntimeService().evaluateVersionSignal(
        input.userId,
        input.config.strategyVersionId,
        input.symbol,
      );
      return {
        action: signal.action,
        confidence: signal.confidence,
        price: signal.price,
        decisionId: `${signal.strategyVersionId}-${input.symbol}-${signal.marketTimestamp}`,
        evidenceIds: [`strategy:${signal.sourceHash}`, `market:${input.symbol}:${signal.marketTimestamp}`],
        marketTimestamp: signal.marketTimestamp,
        dataProvenance: {
          providerId: `hermes-strategy-runtime:${signal.engineVersion}`,
          retrievedAt: new Date().toISOString(),
          marketTimestamp: signal.marketTimestamp,
          delayed: false,
          cacheStatus: 'runtime-evaluated',
        },
        maxDataAgeMs: 20 * 60_000,
      };
    }
    const { runTradingAnalysis } = await import('./autonomousAgent.js');
    return runTradingAnalysis(input.config, input.symbol, {
      emitLog: (log) => this.emitLog(log),
      publish: (event) => this.publish(event),
      pushRecentPrice: (symbol, price, maxLen = 240) => {
        if (!Number.isFinite(price) || price <= 0) {
          return this.state.recentPriceSeries.get(symbol) ?? [];
        }
        const prices = this.state.recentPriceSeries.get(symbol) ?? [];
        prices.push(price);
        if (prices.length > maxLen) prices.splice(0, prices.length - maxLen);
        this.state.recentPriceSeries.set(symbol, prices);
        return [...prices];
      },
      broadcastSentiment: (score) => {
        const clamped = Math.max(0, Math.min(100, score));
        this.state.lastSentimentScore = Math.round(
          this.state.lastSentimentScore * 0.7 + clamped * 0.3,
        );
        this.publish({
          type: 'global_sentiment',
          data: {
            userId: this.state.userId,
            score: this.state.lastSentimentScore,
          },
        });
      },
      warn: (_key, message) => this.emitLog({
        level: 'WARNING',
        source: 'ANALYSIS',
        symbol: input.symbol,
        message,
      }),
    });
  }

  private emitLog(log: Omit<AgentLog, 'id' | 'timestamp'>): void {
    const emitted = this.state.appendLog(log);
    this.publish({
      type: 'agent_log',
      data: {
        userId: this.state.userId,
        log: emitted,
      },
    });
  }

  private scheduleNextTick(): void {
    this.clearTimer();
    if (this.state.status !== 'running') return;
    this.state.tickTimeout = setTimeout(
      () => void this.runTick(),
      this.state.config.tickIntervalMs,
    );
    this.state.tickTimeout.unref?.();
  }

  private scheduleCooldownResume(delayMs: number): void {
    this.clearTimer();
    this.state.tickTimeout = setTimeout(() => {
      if (this.state.status !== 'cooldown') return;
      this.state.status = 'running';
      this.state.cooldownUntil = null;
      this.state.lossStreakCount = 0;
      void this.persistState();
      void this.runTick();
    }, delayMs);
    this.state.tickTimeout.unref?.();
  }

  private clearTimer(): void {
    if (this.state.tickTimeout) clearTimeout(this.state.tickTimeout);
    this.state.tickTimeout = null;
  }

  private async persistState(): Promise<void> {
    const snapshot = this.state.snapshot();
    const operation = this.persistChain.then(() => this.persist(snapshot));
    this.persistChain = operation.catch((error) => {
      this.emitLog({
        level: 'ERROR',
        source: 'PERSIST',
        symbol: 'ALL',
        message: `工作階段狀態保存失敗: ${error instanceof Error ? error.message : String(error)}`,
      });
    });
    await operation.catch(() => undefined);
  }
}
