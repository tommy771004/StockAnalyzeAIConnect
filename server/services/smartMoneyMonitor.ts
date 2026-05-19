import * as usersRepo from '../repositories/usersRepo.js';
import * as watchlistRepo from '../repositories/watchlistRepo.js';
import { notifier } from './notifier/index.js';
import {
  getLatest13FOverview,
  getRecentInsiderActivity,
  type InsiderActivityOverview,
  type InsiderTransaction,
  type SmartMoney13FOverview,
  type SmartMoneyHolding,
  type TrackedManager,
} from '../utils/smartMoneyApi.js';
import {
  getAllTrackedManagers,
  getSmartMoneySettingsForUser,
  getSmartMoneyStateForUser,
  saveSmartMoneyStateForUser,
  type SmartMoneyAlertEvent,
  type SmartMoneySettings,
  type SmartMoneyState,
} from './smartMoneyConfig.js';

interface SmartMoneyMonitorCache {
  managerOverviews: Map<string, Promise<SmartMoney13FOverview | null>>;
  insiderActivity: Map<string, Promise<InsiderActivityOverview | null>>;
}

interface ScanOptions {
  notify?: boolean;
  cache?: SmartMoneyMonitorCache;
}

interface ScanResult {
  newEvents: SmartMoneyAlertEvent[];
  settings: SmartMoneySettings;
  state: SmartMoneyState;
}

let monitorInFlight = false;

function createCache(): SmartMoneyMonitorCache {
  return {
    managerOverviews: new Map(),
    insiderActivity: new Map(),
  };
}

function dedupeStrings(values: string[], max = 400): string[] {
  return Array.from(new Set(values)).slice(-max);
}

function normalizeUsSymbol(raw: string): string | null {
  const symbol = raw.trim().toUpperCase();
  if (!symbol) return null;
  if (symbol.endsWith('.TW') || symbol.endsWith('.TWO')) return null;
  return symbol;
}

function managerCacheKey(manager: TrackedManager): string {
  return `${manager.id}:${manager.cik}`;
}

function formatUsd(value: number | null): string {
  if (value == null) return '---';
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${Math.round(value).toLocaleString('en-US')}`;
}

function create13FEvent(
  overview: SmartMoney13FOverview,
  holding: SmartMoneyHolding,
  detectedAt: string,
): SmartMoneyAlertEvent {
  return {
    id: `13f:${overview.manager.cik}:${overview.currentFiling.accessionNumber}:${holding.cusip || holding.issuer.toUpperCase()}`,
    type: '13f_new_position',
    detectedAt,
    eventDate: overview.currentFiling.filingDate,
    title: `${overview.manager.name} 新建倉`,
    summary: `${holding.issuer}${holding.classTitle ? ` · ${holding.classTitle}` : ''} · ${formatUsd(holding.valueUsd)}`,
    symbol: null,
    issuer: holding.issuer,
    managerId: overview.manager.id,
    managerName: overview.manager.name,
    insiderName: null,
    amountUsd: holding.valueUsd,
    sourceUrl: overview.currentFiling.url,
    autoAddedToWatchlist: false,
  };
}

function createInsiderEvent(
  activity: InsiderActivityOverview,
  transaction: InsiderTransaction,
  detectedAt: string,
  autoAddedToWatchlist: boolean,
): SmartMoneyAlertEvent {
  return {
    id: `insider:${activity.company.cik}:${transaction.filingUrl}:${transaction.tradeDate}:${transaction.insiderName}:${transaction.amountUsd ?? transaction.shares ?? 0}`,
    type: 'insider_large_buy',
    detectedAt,
    eventDate: transaction.tradeDate,
    title: `${activity.company.ticker} 內部人大額買入`,
    summary: `${transaction.insiderName} · ${transaction.title} · ${formatUsd(transaction.amountUsd)}`,
    symbol: activity.company.ticker,
    issuer: activity.company.name,
    managerId: null,
    managerName: null,
    insiderName: transaction.insiderName,
    amountUsd: transaction.amountUsd,
    sourceUrl: transaction.filingUrl,
    autoAddedToWatchlist,
  };
}

function mergeRecentEvents(
  existing: SmartMoneyAlertEvent[],
  incoming: SmartMoneyAlertEvent[],
): SmartMoneyAlertEvent[] {
  const merged = new Map<string, SmartMoneyAlertEvent>();
  for (const event of [...incoming, ...existing]) {
    if (!merged.has(event.id)) merged.set(event.id, event);
  }

  return Array.from(merged.values())
    .sort((left, right) => {
      if (left.eventDate === right.eventDate) {
        return right.detectedAt.localeCompare(left.detectedAt);
      }
      return right.eventDate.localeCompare(left.eventDate);
    })
    .slice(0, 50);
}

async function loadManagerOverview(
  manager: TrackedManager,
  customManagers: TrackedManager[],
  cache: SmartMoneyMonitorCache,
): Promise<SmartMoney13FOverview | null> {
  const key = managerCacheKey(manager);
  if (!cache.managerOverviews.has(key)) {
    cache.managerOverviews.set(key, getLatest13FOverview(manager.id, customManagers).catch((error: unknown) => {
      console.warn(`[SmartMoneyMonitor] 13F ${manager.name} failed:`, error instanceof Error ? error.message : error);
      return null;
    }));
  }
  return cache.managerOverviews.get(key)!;
}

async function loadInsiderActivity(
  symbol: string,
  cache: SmartMoneyMonitorCache,
): Promise<InsiderActivityOverview | null> {
  if (!cache.insiderActivity.has(symbol)) {
    cache.insiderActivity.set(symbol, getRecentInsiderActivity(symbol).catch((error: unknown) => {
      console.warn(`[SmartMoneyMonitor] insider ${symbol} failed:`, error instanceof Error ? error.message : error);
      return null;
    }));
  }
  return cache.insiderActivity.get(symbol)!;
}

async function resolveInsiderSymbols(userId: string, settings: SmartMoneySettings): Promise<string[]> {
  const symbols = new Set<string>();

  for (const symbol of settings.insiderSymbols) {
    const normalized = normalizeUsSymbol(symbol);
    if (normalized) symbols.add(normalized);
  }

  if (settings.useWatchlistForInsiderSymbols) {
    const watchlist = await watchlistRepo.getWatchlistByUser(userId);
    for (const item of watchlist) {
      const normalized = normalizeUsSymbol(item.symbol);
      if (normalized) symbols.add(normalized);
    }
  }

  return Array.from(symbols.values());
}

async function dispatchEvent(userId: string, event: SmartMoneyAlertEvent): Promise<void> {
  if (event.type === '13f_new_position') {
    await notifier.dispatch(userId, 'smart_money_13f_new_position', {
      managerName: event.managerName,
      issuer: event.issuer,
      filingDate: event.eventDate,
      valueUsd: event.amountUsd,
      sourceUrl: event.sourceUrl,
    });
    return;
  }

  await notifier.dispatch(userId, 'smart_money_insider_large_buy', {
    symbol: event.symbol,
    issuer: event.issuer,
    insiderName: event.insiderName,
    tradeDate: event.eventDate,
    amountUsd: event.amountUsd,
    sourceUrl: event.sourceUrl,
  });
}

export async function scanSmartMoneyForUser(userId: string, options: ScanOptions = {}): Promise<ScanResult> {
  const cache = options.cache ?? createCache();
  const settings = await getSmartMoneySettingsForUser(userId);
  const previousState = await getSmartMoneyStateForUser(userId);

  if (!settings.enabled) {
    return {
      newEvents: [],
      settings,
      state: previousState,
    };
  }

  const detectedAt = new Date().toISOString();
  const availableManagers = getAllTrackedManagers(settings.customManagers);
  const managerMap = new Map(availableManagers.map((manager) => [manager.id, manager]));
  const seenEventIds = new Set(previousState.seenEventIds);
  const newEvents: SmartMoneyAlertEvent[] = [];

  for (const managerId of settings.trackedManagerIds) {
    const manager = managerMap.get(managerId);
    if (!manager) continue;

    const overview = await loadManagerOverview(manager, settings.customManagers, cache);
    if (!overview) continue;

    for (const holding of overview.newPositions) {
      const event = create13FEvent(overview, holding, detectedAt);
      if (seenEventIds.has(event.id)) continue;
      seenEventIds.add(event.id);
      newEvents.push(event);
    }
  }

  const insiderSymbols = await resolveInsiderSymbols(userId, settings);
  for (const symbol of insiderSymbols) {
    const activity = await loadInsiderActivity(symbol, cache);
    if (!activity) continue;

    for (const transaction of activity.transactions) {
      const amountUsd = transaction.amountUsd ?? 0;
      if (transaction.action !== 'Buy' || amountUsd < settings.minInsiderBuyUsd) continue;

      let autoAddedToWatchlist = false;
      if (settings.autoAddInsiderSignalsToWatchlist) {
        await watchlistRepo.addWatchlistItem({
          userId,
          symbol: activity.company.ticker,
          name: activity.company.name,
          addedAt: Date.now(),
        });
        autoAddedToWatchlist = true;
      }

      const event = createInsiderEvent(activity, transaction, detectedAt, autoAddedToWatchlist);
      if (seenEventIds.has(event.id)) continue;
      seenEventIds.add(event.id);
      newEvents.push(event);
    }
  }

  const orderedNewEvents = newEvents.sort((left, right) => {
    if (left.eventDate === right.eventDate) {
      return right.detectedAt.localeCompare(left.detectedAt);
    }
    return right.eventDate.localeCompare(left.eventDate);
  });

  const shouldNotify = (options.notify ?? true) && previousState.lastScanAt !== null;
  if (shouldNotify) {
    for (const event of orderedNewEvents) {
      await dispatchEvent(userId, event);
    }
  }

  const nextState: SmartMoneyState = {
    seenEventIds: dedupeStrings([...previousState.seenEventIds, ...orderedNewEvents.map((event) => event.id)]),
    recentEvents: mergeRecentEvents(previousState.recentEvents, orderedNewEvents),
    lastScanAt: detectedAt,
  };

  await saveSmartMoneyStateForUser(userId, nextState);

  return {
    newEvents: orderedNewEvents,
    settings,
    state: nextState,
  };
}

export async function runSmartMoneyMonitorCycle(): Promise<void> {
  if (monitorInFlight) return;
  monitorInFlight = true;

  try {
    const users = await usersRepo.getAllUsers();
    const cache = createCache();

    for (const user of users) {
      try {
        await scanSmartMoneyForUser(user.id, { notify: true, cache });
      } catch (error: unknown) {
        console.error(`[SmartMoneyMonitor] user ${user.email} failed:`, error instanceof Error ? error.message : error);
      }
    }
  } finally {
    monitorInFlight = false;
  }
}