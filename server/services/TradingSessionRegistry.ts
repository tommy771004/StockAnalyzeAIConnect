import type { AgentConfig } from '../../src/components/AutoTrading/types.js';
import { AgentConfigPatchSchema } from '../utils/configSchema.js';
import {
  AutonomousTradingSession,
  type AutonomousTradingSessionDependencies,
} from './AutonomousTradingSession.js';
import {
  TradingSessionState,
  type TradingSessionSnapshot,
} from './tradingSessionState.js';

export interface TradingSessionRepository {
  saveConfig(userId: string, config: AgentConfig, status?: string): Promise<unknown>;
  saveSessionSnapshot(snapshot: TradingSessionSnapshot): Promise<unknown>;
  getAllActiveSessionSnapshots(): Promise<TradingSessionSnapshot[]>;
}

export interface TradingSessionRegistryOptions
  extends Omit<AutonomousTradingSessionDependencies, 'persist' | 'publish'> {
  repo: TradingSessionRepository;
  publish?: (userId: string, event: { type: string; data: unknown }) => void;
}

type StartOptions = { runImmediately?: boolean };

export class TradingSessionRegistry {
  private readonly sessions = new Map<string, AutonomousTradingSession>();

  constructor(private readonly options: TradingSessionRegistryOptions) {}

  get size(): number {
    return this.sessions.size;
  }

  get(userId: string): AutonomousTradingSession | undefined {
    return this.sessions.get(userId);
  }

  ensure(userId: string): AutonomousTradingSession {
    return this.sessions.get(userId) ?? this.create(new TradingSessionState(userId));
  }

  require(userId: string): AutonomousTradingSession {
    const session = this.sessions.get(userId);
    if (!session) throw new Error(`Trading session not found for userId: ${userId}`);
    return session;
  }

  async start(
    userId: string,
    config?: Partial<AgentConfig>,
    startOptions?: StartOptions,
  ): Promise<AutonomousTradingSession> {
    const parsed = AgentConfigPatchSchema.safeParse(config ?? {});
    if (!parsed.success) {
      throw new Error(parsed.error.issues.map((issue) => issue.message).join('; '));
    }
    const session = this.ensure(userId);
    await session.start(parsed.data, startOptions);
    await this.options.repo.saveConfig(userId, session.state.config, session.state.status);
    return session;
  }

  stop(userId: string): void {
    this.require(userId).stop();
  }

  async update(userId: string, config: Partial<AgentConfig>): Promise<AutonomousTradingSession> {
    const parsed = AgentConfigPatchSchema.safeParse(config);
    if (!parsed.success) {
      throw new Error(parsed.error.issues.map((issue) => issue.message).join('; '));
    }
    const session = this.ensure(userId);
    const wasActive = session.state.status === 'running';
    await session.start(parsed.data, { runImmediately: false });
    if (!wasActive) session.stop();
    await this.options.repo.saveConfig(userId, session.state.config, session.state.status);
    return session;
  }

  async kill(userId: string): Promise<void> {
    await this.require(userId).emergencyKillSwitch();
  }

  deactivateKill(userId: string): void {
    this.require(userId).deactivateKillSwitch();
  }

  resetBreaker(userId: string): void {
    this.require(userId).resetCircuitBreaker();
  }

  async restoreAll(startOptions: StartOptions = {}): Promise<number> {
    const snapshots = await this.options.repo.getAllActiveSessionSnapshots();
    const restoredStates = snapshots.map((snapshot) => TradingSessionState.restore(snapshot));
    const seen = new Set<string>();
    for (const state of restoredStates) {
      if (seen.has(state.userId) || this.sessions.has(state.userId)) {
        throw new Error(`Duplicate trading session userId: ${state.userId}`);
      }
      seen.add(state.userId);
    }

    for (const state of restoredStates) {
      const session = this.create(state);
      await session.resume(startOptions);
    }
    return restoredStates.length;
  }

  disposeAll(): void {
    for (const session of this.sessions.values()) session.state.dispose();
    this.sessions.clear();
  }

  private create(state: TradingSessionState): AutonomousTradingSession {
    const session = new AutonomousTradingSession(state, {
      analyze: this.options.analyze,
      isMarketOpen: this.options.isMarketOpen,
      publish: (event) => this.options.publish?.(state.userId, event),
      persist: (snapshot) => this.options.repo.saveSessionSnapshot(snapshot).then(() => undefined),
    });
    this.sessions.set(state.userId, session);
    return session;
  }
}
