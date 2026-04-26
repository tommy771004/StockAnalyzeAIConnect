import React from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/utils';
import { Layers } from 'lucide-react';

export const SECTORS = [
  { id: 'tech', label: '科技半導體', symbols: ['2330.TW', '2454.TW', '2317.TW', '2303.TW', '2382.TW', '2311.TW'] },
  { id: 'finance', label: '金融保險', symbols: ['2881.TW', '2882.TW', '2891.TW', '2884.TW', '2886.TW'] },
  { id: 'shipping', label: '航運', symbols: ['2603.TW', '2609.TW', '2615.TW'] },
  { id: 'biotech', label: '生技醫療', symbols: ['4743.TWO', '6446.TWO', '4128.TWO', '3176.TWO'] },
  { id: 'ai', label: 'AI概念', symbols: ['3231.TW', '2376.TW', '2382.TW', '6669.TW', '3661.TW'] },
];

interface Props {
  selectedSymbols: string[];
  onSelectSymbols: (symbols: string[]) => void;
  disabled?: boolean;
}

export function SectorSelector({ selectedSymbols, onSelectSymbols, disabled }: Props) {
  const { t } = useTranslation();
  // If the selected symbols exactly match a sector, mark it as active
  const activeSector = SECTORS.find(s => 
    s.symbols.length === selectedSymbols.length && 
    s.symbols.every(sym => selectedSymbols.includes(sym))
  )?.id;

  return (
    <div className="space-y-3 bg-black/20 border border-white/5 p-4 rounded-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Layers className="h-3.5 w-3.5 text-cyan-400" />
          <span className="text-[10px] font-bold text-white/50 uppercase tracking-widest">{t('autotrading.strategy.sectorTargeting', 'Sector Targeting (類股篩選)')}</span>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {SECTORS.map(sec => (
          <button
            key={sec.id}
            disabled={disabled}
            onClick={() => onSelectSymbols(sec.symbols)}
            className={cn(
              "px-3 py-1.5 text-[11px] font-bold tracking-widest rounded-sm border transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed",
              activeSector === sec.id 
                ? "bg-cyan-500/20 text-cyan-400 border-cyan-500/30 shadow-[0_0_10px_rgba(6,182,212,0.15)]" 
                : "bg-white/5 text-white/40 border-white/10 hover:text-white/80 hover:bg-white/10 hover:border-white/20"
            )}
          >
            {sec.label}
          </button>
        ))}
      </div>
    </div>
  );
}
