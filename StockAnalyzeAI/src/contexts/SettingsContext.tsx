import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { getSetting, setSetting } from '../services/api';

interface SettingsContextType {
  settings: Record<string, unknown>;
  updateSetting: (key: string, value: unknown) => void;
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

  return (
    <SettingsContext.Provider value={{ settings, updateSetting }}>
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
};
