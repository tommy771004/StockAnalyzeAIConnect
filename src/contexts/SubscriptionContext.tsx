import React, { createContext, useContext, useState, useCallback } from 'react';

export enum SubscriptionTier {
  FREE  = 'free',
  BASIC = 'basic',
  PRO   = 'pro',
}

/** The numeric rank of each tier — used for access comparison */
export const TIER_RANK: Record<SubscriptionTier, number> = {
  [SubscriptionTier.FREE]:  0,
  [SubscriptionTier.BASIC]: 1,
  [SubscriptionTier.PRO]:   2,
};

interface SubscriptionContextType {
  tier: SubscriptionTier;
  setTier: (tier: SubscriptionTier) => void;
  /** True if user's tier rank >= required tier rank */
  hasAccess: (required: SubscriptionTier) => boolean;
  isUpgradeModalOpen: boolean;
  /** Open the modal. Optionally pass a highlight tier to auto-scroll/highlight. */
  openUpgradeModal: (highlightTier?: SubscriptionTier) => void;
  closeUpgradeModal: () => void;
  /** Which tier to highlight when the modal opens (set by context-aware gates) */
  highlightTier: SubscriptionTier | null;
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
  const [highlightTier, setHighlightTier] = useState<SubscriptionTier | null>(null);

  const hasAccess = useCallback(
    (required: SubscriptionTier) => TIER_RANK[tier] >= TIER_RANK[required],
    [tier],
  );

  const openUpgradeModal = useCallback((ht?: SubscriptionTier) => {
    setHighlightTier(ht ?? null);
    setIsUpgradeModalOpen(true);
  }, []);

  const closeUpgradeModal = useCallback(() => {
    setIsUpgradeModalOpen(false);
    setHighlightTier(null);
  }, []);

  return (
    <SubscriptionContext.Provider
      value={{
        tier,
        setTier,
        hasAccess,
        isUpgradeModalOpen,
        openUpgradeModal,
        closeUpgradeModal,
        highlightTier,
      }}
    >
      {children}
    </SubscriptionContext.Provider>
  );
};
