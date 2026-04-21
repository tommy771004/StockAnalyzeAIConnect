import React, { createContext, useContext, useState } from 'react';

export enum SubscriptionTier {
  FREE = 'free',
  BASIC = 'basic',
  PRO = 'pro'
}

interface SubscriptionContextType {
  tier: SubscriptionTier;
  setTier: (tier: SubscriptionTier) => void;
  isUpgradeModalOpen: boolean;
  openUpgradeModal: () => void;
  closeUpgradeModal: () => void;
}

const SubscriptionContext = createContext<SubscriptionContextType | null>(null);

export const useSubscription = (): SubscriptionContextType => {
  const ctx = useContext(SubscriptionContext);
  if (!ctx) throw new Error('useSubscription must be used within SubscriptionProvider');
  return ctx;
};

export const SubscriptionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [tier, setTier] = useState<SubscriptionTier>(SubscriptionTier.FREE);
  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);

  return (
    <SubscriptionContext.Provider
      value={{
        tier,
        setTier,
        isUpgradeModalOpen,
        openUpgradeModal: () => setIsUpgradeModalOpen(true),
        closeUpgradeModal: () => setIsUpgradeModalOpen(false),
      }}
    >
      {children}
    </SubscriptionContext.Provider>
  );
};
