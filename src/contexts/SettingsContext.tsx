import React, { createContext, useContext, useState, useEffect, ReactNode, useMemo } from 'react';
import { getSetting, setSetting } from '../services/api';
import * as formatters from '../utils/formatters';

interface SettingsContextType {
  settings: Record<string, any>;
  updateSetting: (key: string, value: any) => void;
  format: {
    price: (v: number, c?: string) => string;
    currency: (v: number, c?: string) => string;
    percent: (v: number, d?: number) => string;
    volume: (v: number) => string;
    number: (v: number, d?: number) => string;
  };
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export const SettingsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<Record<string, unknown>>({});

  useEffect(() => {
    const loadSettings = async () => {
      const keys = ['fontSize', 'compactMode', 'commuteMode', 'animationsOn', 'theme', 'language', 'sidebarDefaultState', 'defaultOrderQty', 'defaultOrderType', 'defaultPriceType', 'slippageTolerance', 'defaultBroker', 'defaultChartTimeframe', 'displayCurrency', 'defaultModel', 'systemInstruction']; // Add keys as needed
      const loaded: Record<string, unknown> = {};
      for (const key of keys) {
        const val = await getSetting(key);
        if (val !== null && val !== undefined) loaded[key] = val;
      }
      setSettings(loaded);
    };
    loadSettings();
  }, []);

  const updateSetting = async (key: string, value: unknown) => {
    setSettings(prev => {
      const newSettings = { ...prev, [key]: value };
      if (key === 'fontSize') {
        newSettings.compactMode = (value as string) === 'small';
      }
      if (key === 'compactMode') {
        newSettings.fontSize = value ? 'small' : 'medium';
      }
      return newSettings;
    });
    await setSetting(key, value);
    if (key === 'fontSize') {
      await setSetting('compactMode', (value as string) === 'small');
    }
    if (key === 'compactMode') {
      await setSetting('fontSize', value ? 'small' : 'medium');
    }
  };

  const format = useMemo(() => ({
    price: (v: number, c?: string) => formatters.formatPrice(v, c || (settings.displayCurrency as string) || 'USD', (settings.language as string) || 'zh-TW'),
    currency: (v: number, c?: string) => formatters.formatCurrency(v, c || (settings.displayCurrency as string) || 'USD', (settings.language as string) || 'zh-TW'),
    percent: (v: number, d?: number) => formatters.formatPercent(v, d),
    volume: (v: number) => formatters.formatVolume(v, (settings.language as string) || 'en-US'),
    number: (v: number, d?: number) => formatters.formatNumber(v, d, (settings.language as string) || 'zh-TW'),
  }), [settings.displayCurrency, settings.language]);

  return (
    <SettingsContext.Provider value={{ settings, updateSetting, format }}>
      {children}
    </SettingsContext.Provider>
  );
}

export const useSettings = () => {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
};
