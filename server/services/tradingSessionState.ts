import type {
  AgentConfig,
  AgentLog,
  AgentStatus,
  EquitySnapshot,
} from '../../src/components/AutoTrading/types.js';
import { DEFAULT_AGENT_CONFIG } from './autotradingDefaults.js';
import { RiskManager, type RiskManagerSnapshot } from './RiskManager.js';
import {
  SimulatedAdapter,
  type SimulatedBrokerSnapshot,
} from './brokers/SimulatedAdapter.js';

type PositionTrack = { avgCost: number; qty: number };
type LogInput = Omit<AgentLog, 'id' | 'timestamp'> & Partial<Pick<AgentLog, 'id' | 'timestamp'>>;

export interface TradingSessionSnapshot {
  userId: string;
  status: AgentStatus;
  config: AgentConfig;
  lastSentimentScore: number;
  lastEquityBroadcast: number;
  equityHistory: EquitySnapshot[];
  logs: AgentLog[];
  recentPriceSeries: Array<[string, number[]]>;
  posTrack: Array<[string, PositionTrack]>;
  peakPriceTrack: Array<[string, number]>;
  lossStreakCount: number;
  risk: RiskManagerSnapshot;
  paperBroker: SimulatedBrokerSnapshot;
  cooldownUntil: string | null;
}

function cloneAgentConfig(config: AgentConfig): AgentConfig {
  return structuredClone(config);
}

function requireFinite(value: number, field: string): number {
  if (!Number.isFinite(value)) {
    throw new Error(`Invalid trading session snapshot field: ${field}`);
  }
  return value;
}

function validateSnapshot(snapshot: TradingSessionSnapshot): void {
  if (!snapshot?.userId?.trim()) {
    throw new Error('Trading session snapshot userId is required');
  }
  if (snapshot.config?.userId && snapshot.config.userId !== snapshot.userId) {
    throw new Error('Trading session snapshot config userId does not match owner');
  }
  if (!['running', 'stopped', 'cooldown', 'error', 'paused'].includes(snapshot.status)) {
    throw new Error('Invalid trading session snapshot status');
  }
  if (!snapshot.config || !Array.isArray(snapshot.config.symbols)) {
    throw new Error('Invalid trading session snapshot config');
  }
  for (const field of [
    'equityHistory',
    'logs',
    'recentPriceSeries',
    'posTrack',
    'peakPriceTrack',
  ] as const) {
    if (!Array.isArray(snapshot[field])) {
      throw new Error(`Invalid trading session snapshot field: ${field}`);
    }
  }
  requireFinite(snapshot.lastSentimentScore, 'lastSentimentScore');
  requireFinite(snapshot.lastEquityBroadcast, 'lastEquityBroadcast');
  if (!Number.isInteger(snapshot.lossStreakCount) || snapshot.lossStreakCount < 0) {
    throw new Error('Invalid trading session snapshot field: lossStreakCount');
  }
  for (const [symbol, position] of snapshot.posTrack) {
    if (
      !symbol
      || !position
      || !Number.isFinite(position.qty)
      || position.qty < 0
      || !Number.isFinite(position.avgCost)
      || position.avgCost < 0
    ) {
      throw new Error('Invalid trading session snapshot field: posTrack');
    }
  }
  for (const [symbol, peak] of snapshot.peakPriceTrack) {
    if (!symbol || !Number.isFinite(peak) || peak < 0) {
      throw new Error('Invalid trading session snapshot field: peakPriceTrack');
    }
  }
  if (
    snapshot.cooldownUntil
    && !Number.isFinite(new Date(snapshot.cooldownUntil).getTime())
  ) {
    throw new Error('Invalid trading session snapshot field: cooldownUntil');
  }
}

export class TradingSessionState {
  readonly userId: string;
  status: AgentStatus = 'stopped';
  config: AgentConfig;
  readonly riskManager = new RiskManager();
  readonly paperBroker = new SimulatedAdapter();
  lastSentimentScore = 50;
  lastEquityBroadcast = 0;
  readonly equityHistory: EquitySnapshot[] = [];
  readonly recentPriceSeries = new Map<string, number[]>();
  readonly posTrack = new Map<string, PositionTrack>();
  readonly peakPriceTrack = new Map<string, number>();
  lossStreakCount = 0;
  cooldownUntil: string | null = null;
  syncInProgress = false;
  tickTimeout: NodeJS.Timeout | null = null;

  private readonly logBuffer: AgentLog[] = [];
  private tickRunning = false;

  constructor(userId: string) {
    if (!userId.trim()) throw new Error('Trading session userId is required');
    this.userId = userId;
    this.config = {
      ...cloneAgentConfig(DEFAULT_AGENT_CONFIG),
      userId,
    };
  }

  appendLog(input: LogInput): AgentLog {
    const log: AgentLog = {
      ...input,
      id: input.id ?? globalThis.crypto.randomUUID(),
      timestamp: input.timestamp ?? new Date().toISOString(),
    };
    this.logBuffer.push(log);
    if (this.logBuffer.length > 1_000) this.logBuffer.shift();
    return { ...log };
  }

  logs(limit = 200): AgentLog[] {
    const safeLimit = Math.max(0, Math.floor(limit));
    return this.logBuffer.slice(-safeLimit).map((log) => structuredClone(log));
  }

  beginTick(): boolean {
    if (this.tickRunning) return false;
    this.tickRunning = true;
    return true;
  }

  endTick(): void {
    this.tickRunning = false;
  }

  isTickRunning(): boolean {
    return this.tickRunning;
  }

  dispose(): void {
    if (this.tickTimeout) clearTimeout(this.tickTimeout);
    this.tickTimeout = null;
    this.tickRunning = false;
    this.syncInProgress = false;
  }

  snapshot(): TradingSessionSnapshot {
    return {
      userId: this.userId,
      status: this.status,
      config: cloneAgentConfig(this.config),
      lastSentimentScore: this.lastSentimentScore,
      lastEquityBroadcast: this.lastEquityBroadcast,
      equityHistory: structuredClone(this.equityHistory),
      logs: this.logs(1_000),
      recentPriceSeries: Array.from(
        this.recentPriceSeries,
        ([symbol, prices]) => [symbol, [...prices]],
      ),
      posTrack: Array.from(
        this.posTrack,
        ([symbol, position]) => [symbol, { ...position }],
      ),
      peakPriceTrack: Array.from(this.peakPriceTrack),
      lossStreakCount: this.lossStreakCount,
      risk: this.riskManager.exportState(),
      paperBroker: this.paperBroker.exportState(),
      cooldownUntil: this.cooldownUntil,
    };
  }

  static restore(snapshot: TradingSessionSnapshot): TradingSessionState {
    validateSnapshot(snapshot);

    const state = new TradingSessionState(snapshot.userId);
    state.status = snapshot.status;
    state.config = {
      ...cloneAgentConfig(snapshot.config),
      userId: snapshot.userId,
    };
    state.lastSentimentScore = snapshot.lastSentimentScore;
    state.lastEquityBroadcast = snapshot.lastEquityBroadcast;
    state.equityHistory.push(...structuredClone(snapshot.equityHistory));
    state.logBuffer.push(...structuredClone(snapshot.logs));
    for (const [symbol, prices] of snapshot.recentPriceSeries) {
      state.recentPriceSeries.set(symbol, [...prices]);
    }
    for (const [symbol, position] of snapshot.posTrack) {
      state.posTrack.set(symbol, { ...position });
    }
    for (const [symbol, price] of snapshot.peakPriceTrack) {
      state.peakPriceTrack.set(symbol, price);
    }
    state.lossStreakCount = snapshot.lossStreakCount;
    state.cooldownUntil = snapshot.cooldownUntil ?? null;
    state.riskManager.restoreState(snapshot.risk);
    state.paperBroker.restoreState(snapshot.paperBroker);
    return state;
  }
}
