/**
 * src/terminal/constants/storage.ts
 *
 * Fix #9: Single source of truth for localStorage key names.
 * Both Layout.tsx and TickerTape.tsx previously declared STORAGE_KEY independently.
 * Change the key here once — both consumers update automatically.
 */

/** Versioned key for user's custom ticker tape symbols. */
export const TICKER_STORAGE_KEY = 'ticker_symbols:v1';

/** Legacy key from before versioning — used only for migration, not writes. */
export const TICKER_STORAGE_KEY_LEGACY = 'ticker_tape_custom_symbols';

/** Persist the local fallback for the manager-search toggle that only shows SEC-verified 13F filers. */
export const SMART_MONEY_MANAGER_SEARCH_FILTER_KEY = 'smart_money_manager_search_verified_only:v1';

/** Per-user setting key for Smart Money UI preferences synced through the server. */
export const SMART_MONEY_UI_PREFERENCES_SETTING_KEY = 'SMART_MONEY_UI_PREFERENCES';
