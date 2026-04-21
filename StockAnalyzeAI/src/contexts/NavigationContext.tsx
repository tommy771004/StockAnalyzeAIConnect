import React, { createContext, useContext, useState, ReactNode } from 'react';

type Page = 'market'|'trading'|'backtest'|'strategy'|'portfolio'|'journal'|'logs'|'settings'|'sentiment'|'screener';
type TopTab = 'markets'|'orders'|'analytics';

interface NavigationContextType {
  page: Page;
  setPage: (page: Page) => void;
  topTab: TopTab;
  setTopTab: (tab: TopTab) => void;
}

const NavigationContext = createContext<NavigationContextType | undefined>(undefined);

export const NavigationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [page, setPage] = useState<Page>('market');
  const [topTab, setTopTab] = useState<TopTab>('markets');

  return (
    <NavigationContext.Provider value={{ page, setPage, topTab, setTopTab }}>
      {children}
    </NavigationContext.Provider>
  );
};

export const useNavigation = () => {
  const context = useContext(NavigationContext);
  if (!context) {
    throw new Error('useNavigation must be used within a NavigationProvider');
  }
  return context;
};
