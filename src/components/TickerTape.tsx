import React from 'react';
import { motion } from 'motion/react';
import { useMarketData } from '../contexts/MarketDataContext';
import { cn } from '../lib/utils';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react';

export const TickerTape: React.FC = () => {
  const { tickers } = useMarketData();

  if (!tickers || tickers.length === 0) return null;

  // Duplicate items twice to ensure smooth infinite loop
  const items = [...tickers, ...tickers, ...tickers, ...tickers];

  return (
    <div className="w-full h-9 flex items-center overflow-hidden border-b z-[60] bg-[#070d1f]/80 backdrop-blur-xl relative"
         style={{ borderColor: 'var(--md-outline-variant)' }}>
      
      {/* Edge Fading Masks */}
      <div className="absolute inset-y-0 left-0 w-16 z-10 pointer-events-none bg-gradient-to-r from-[#070d1f] to-transparent" />
      <div className="absolute inset-y-0 right-0 w-16 z-10 pointer-events-none bg-gradient-to-l from-[#070d1f] to-transparent" />

      <motion.div 
        className="flex items-center gap-12 whitespace-nowrap px-4"
        initial={{ x: "0%" }}
        animate={{ x: "-50%" }}
        transition={{ 
          duration: 40, 
          repeat: Infinity, 
          ease: "linear" 
        }}
      >
        {items.map((t, idx) => {
          const up = t.pct >= 0;
          return (
            <div key={`${t.symbol}-${idx}`} className="flex items-center gap-2.5 group cursor-default">
              <span className="text-[11px] font-black tracking-widest text-zinc-400 uppercase transition-colors group-hover:text-white" style={{ fontFamily: 'var(--font-data)' }}>
                {t.symbol.replace('-USD', '').replace('^', '')}
              </span>
              <div className={cn(
                "flex items-center gap-1 font-mono text-[11px] font-black tabular-nums transition-transform group-hover:scale-105",
                up ? "text-price-up" : "text-price-down"
              )}>
                {up ? <ArrowUpRight size={13} strokeWidth={3} /> : <ArrowDownRight size={13} strokeWidth={3} />}
                {up ? '+' : ''}{t.pct.toFixed(2)}%
              </div>
            </div>
          );
        })}
      </motion.div>
    </div>
  );
};
