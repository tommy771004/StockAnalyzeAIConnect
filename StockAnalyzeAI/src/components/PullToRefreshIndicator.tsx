/**
 * PullToRefreshIndicator.tsx — Visual feedback for pull-to-refresh
 *
 * Place this at the very top of any scrollable page.
 * Pass the `state` from usePullToRefresh.
 */
import React, { memo } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import type { PullState } from '../hooks/usePullToRefresh';

interface Props {
  state: PullState;
  label?: string;
}

const PullToRefreshIndicatorInner: React.FC<Props> = ({
  state,
  label = '下拉更新',
}) => {
  const { progress, refreshing, pulling } = state;
  const visible = pulling || refreshing;
  const ready   = progress >= 1;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="ptr"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: refreshing ? 56 : Math.min(progress * 56, 56), opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          className="flex items-center justify-center overflow-hidden shrink-0"
        >
          <div className={`flex items-center gap-2 text-xs font-bold transition-colors ${ready || refreshing ? 'text-emerald-400' : 'text-zinc-500'}`}>
            {refreshing
              ? <Loader2 size={16} className="animate-spin" />
              : (
                <motion.div
                  animate={{ rotate: ready ? 180 : progress * 180 }}
                  transition={{ type: 'spring', stiffness: 200, damping: 20 }}
                >
                  <RefreshCw size={16} />
                </motion.div>
              )
            }
            <span>{refreshing ? '更新中…' : ready ? '放開以更新' : label}</span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export const PullToRefreshIndicator = memo(PullToRefreshIndicatorInner);
export default PullToRefreshIndicator;
