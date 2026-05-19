import * as settingsRepo from '../repositories/settingsRepo.js';
import { getTrackedManagers, type TrackedManager } from '../utils/smartMoneyApi.js';

export const SMART_MONEY_SETTINGS_KEY = 'SMART_MONEY_SETTINGS';
export const SMART_MONEY_STATE_KEY = 'SMART_MONEY_STATE';

export type SmartMoneyEventType = '13f_new_position' | 'insider_large_buy';

export interface SmartMoneyAlertEvent {
  id: string;
  type: SmartMoneyEventType;
  detectedAt: string;
  eventDate: string;
  title: string;
  summary: string;
  symbol: string | null;
  issuer: string | null;
  managerId: string | null;
  managerName: string | null;
  insiderName: string | null;
  amountUsd: number | null;
  sourceUrl: string;
  autoAddedToWatchlist: boolean;
}

export interface SmartMoneyState {
  seenEventIds: string[];
  recentEvents: SmartMoneyAlertEvent[];
  lastScanAt: string | null;
}

export interface SmartMoneySettings {
  enabled: boolean;
  trackedManagerIds: string[];
  customManagers: TrackedManager[];
  useWatchlistForInsiderSymbols: boolean;
  insiderSymbols: string[];
  autoAddInsiderSignalsToWatchlist: boolean;
  minInsiderBuyUsd: number;
}

const DEFAULT_INSIDER_MIN_BUY_USD = 100_000;

function slugify(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

function normalizeCik(raw: string): string | null {
  const digits = String(raw ?? '').replace(/\D/g, '');
  return digits ? String(Number(digits)) : null;
}

function normalizeManager(input: Partial<TrackedManager> | null | undefined): TrackedManager | null {
  if (!input) return null;
  const name = String(input.name ?? '').trim();
  const cik = normalizeCik(String(input.cik ?? ''));
  if (!name || !cik) return null;

  const explicitId = String(input.id ?? '').trim();
  const id = slugify(explicitId || `${name}-${cik}`);
  if (!id) return null;

  return { id, name, cik };
}

function normalizeSymbol(input: unknown): string | null {
  const value = String(input ?? '').trim().toUpperCase();
  if (!value) return null;
  if (value.endsWith('.TW') || value.endsWith('.TWO')) return null;
  return value;
}

export function getDefaultSmartMoneySettings(): SmartMoneySettings {
  return {
    enabled: false,
    trackedManagerIds: getTrackedManagers().slice(0, 3).map((manager) => manager.id),
    customManagers: [],
    useWatchlistForInsiderSymbols: true,
    insiderSymbols: [],
    autoAddInsiderSignalsToWatchlist: false,
    minInsiderBuyUsd: DEFAULT_INSIDER_MIN_BUY_USD,
  };
}

export function getDefaultSmartMoneyState(): SmartMoneyState {
  return {
    seenEventIds: [],
    recentEvents: [],
    lastScanAt: null,
  };
}

export function getAllTrackedManagers(customManagers: TrackedManager[] = []): TrackedManager[] {
  const merged = [...getTrackedManagers(), ...customManagers];
  const deduped = new Map<string, TrackedManager>();
  for (const manager of merged) {
    deduped.set(manager.id, manager);
  }
  return Array.from(deduped.values());
}

export function sanitizeSmartMoneySettings(raw: unknown): SmartMoneySettings {
  const defaults = getDefaultSmartMoneySettings();
  const source = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};

  const customManagers = Array.isArray(source.customManagers)
    ? source.customManagers
        .map((manager) => normalizeManager(manager as Partial<TrackedManager>))
        .filter((manager): manager is TrackedManager => manager !== null)
    : defaults.customManagers;

  const availableManagers = getAllTrackedManagers(customManagers);
  const availableManagerIds = new Set(availableManagers.map((manager) => manager.id));
  const hasTrackedManagerIds = Array.isArray(source.trackedManagerIds);

  const trackedManagerIds = hasTrackedManagerIds
    ? Array.from(new Set(
        source.trackedManagerIds
          .map((value) => String(value ?? '').trim())
          .filter((value) => availableManagerIds.has(value)),
      ))
    : defaults.trackedManagerIds;

  const insiderSymbols = Array.isArray(source.insiderSymbols)
    ? Array.from(new Set(
        source.insiderSymbols
          .map((value) => normalizeSymbol(value))
          .filter((value): value is string => value !== null),
      ))
    : defaults.insiderSymbols;

  const minInsiderBuyUsd = (() => {
    const parsed = Number(source.minInsiderBuyUsd);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : defaults.minInsiderBuyUsd;
  })();

  return {
    enabled: source.enabled === true,
    trackedManagerIds: hasTrackedManagerIds ? trackedManagerIds : defaults.trackedManagerIds,
    customManagers,
    useWatchlistForInsiderSymbols: source.useWatchlistForInsiderSymbols !== false,
    insiderSymbols,
    autoAddInsiderSignalsToWatchlist: source.autoAddInsiderSignalsToWatchlist === true,
    minInsiderBuyUsd,
  };
}

export function sanitizeSmartMoneyState(raw: unknown): SmartMoneyState {
  const defaults = getDefaultSmartMoneyState();
  const source = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};

  const seenEventIds = Array.isArray(source.seenEventIds)
    ? source.seenEventIds.map((value) => String(value ?? '').trim()).filter(Boolean).slice(-400)
    : defaults.seenEventIds;

  const recentEvents = Array.isArray(source.recentEvents)
    ? source.recentEvents
        .filter((event): event is SmartMoneyAlertEvent => !!event && typeof event === 'object' && typeof (event as SmartMoneyAlertEvent).id === 'string')
        .slice(0, 50)
    : defaults.recentEvents;

  const lastScanAt = typeof source.lastScanAt === 'string' && source.lastScanAt.trim()
    ? source.lastScanAt
    : defaults.lastScanAt;

  return {
    seenEventIds,
    recentEvents,
    lastScanAt,
  };
}

export async function getSmartMoneySettingsForUser(userId: string): Promise<SmartMoneySettings> {
  const raw = await settingsRepo.getSetting(userId, SMART_MONEY_SETTINGS_KEY);
  return sanitizeSmartMoneySettings(raw);
}

export async function saveSmartMoneySettingsForUser(userId: string, raw: unknown): Promise<SmartMoneySettings> {
  const settings = sanitizeSmartMoneySettings(raw);
  await settingsRepo.setSetting(userId, SMART_MONEY_SETTINGS_KEY, settings);
  return settings;
}

export async function getSmartMoneyStateForUser(userId: string): Promise<SmartMoneyState> {
  const raw = await settingsRepo.getSetting(userId, SMART_MONEY_STATE_KEY);
  return sanitizeSmartMoneyState(raw);
}

export async function saveSmartMoneyStateForUser(userId: string, state: SmartMoneyState): Promise<void> {
  await settingsRepo.setSetting(userId, SMART_MONEY_STATE_KEY, sanitizeSmartMoneyState(state));
}