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
