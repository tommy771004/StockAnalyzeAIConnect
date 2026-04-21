export const STORAGE_KEYS = {
  WATCHLIST: 'liquid_intel_watchlist',
  PORTFOLIO: 'liquid_intel_portfolio',
};

export const saveToStorage = <T>(key: string, data: T): void => {

  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (e) {
    console.error('Error saving to localStorage', e);
  }
};

export const loadFromStorage = <T>(key: string, defaultValue: T): T => {
  try {
    const item = localStorage.getItem(key);
    return item ? (JSON.parse(item) as T) : defaultValue;
  } catch (e) {
    console.error('Error loading from localStorage', e);
    return defaultValue;
  }
};
