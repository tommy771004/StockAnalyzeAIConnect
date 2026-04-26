import React from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/utils';
import { Layers } from 'lucide-react';
import * as api from '../../services/api';

interface Props {
  selectedSymbols: string[];
  onSelectSymbols: (symbols: string[]) => void;
  disabled?: boolean;
}

export function SectorSelector({ selectedSymbols, onSelectSymbols, disabled }: Props) {
  const { t } = useTranslation();
  const [sectors, setSectors] = React.useState<api.SectorItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [activeSectorId, setActiveSectorId] = React.useState<string | null>(null);
  const [loadingSectorId, setLoadingSectorId] = React.useState<string | null>(null);
  const [sectorSymbolsMap, setSectorSymbolsMap] = React.useState<Record<string, string[]>>({});

  React.useEffect(() => {
    const loadSectors = async () => {
      setLoading(true);
      setError(null);
      try {
        const list = await api.getSectors();
        setSectors(Array.isArray(list) ? list : []);
      } catch (e) {
        setError((e as Error).message || t('autotrading.strategy.sectorsLoadFailed', '無法載入類股清單'));
      } finally {
        setLoading(false);
      }
    };
    void loadSectors();
  }, [t]);

  React.useEffect(() => {
    const next = sectors.find((sector) => {
      const symbols = sectorSymbolsMap[sector.id];
      return symbols &&
        symbols.length === selectedSymbols.length &&
        symbols.every(sym => selectedSymbols.includes(sym));
    });
    setActiveSectorId(next?.id ?? null);
  }, [sectors, sectorSymbolsMap, selectedSymbols]);

  const handleSelectSector = async (sector: api.SectorItem) => {
    if (disabled) return;
    setError(null);
    setLoadingSectorId(sector.id);
    try {
      let symbols = sectorSymbolsMap[sector.id];
      if (!symbols) {
        symbols = await api.getSectorSymbols(sector.id);
        setSectorSymbolsMap(prev => ({ ...prev, [sector.id]: symbols }));
      }
      onSelectSymbols(symbols);
      setActiveSectorId(sector.id);
    } catch (e) {
      const msg = (e as Error).message || t('autotrading.strategy.sectorSymbolsLoadFailed', '查詢類股成分失敗');
      setError(msg);
    } finally {
      setLoadingSectorId(null);
    }
  };

  return (
    <div className="space-y-3 bg-black/20 border border-white/5 p-4 rounded-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Layers className="h-3.5 w-3.5 text-cyan-400" />
          <span className="text-[10px] font-bold text-white/50 uppercase tracking-widest">{t('autotrading.strategy.sectorTargeting', 'Sector Targeting (類股篩選)')}</span>
        </div>
      </div>
      {error && (
        <div className="text-[10px] text-rose-300 border border-rose-500/30 bg-rose-500/10 rounded-sm px-2 py-1.5">
          {error}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {loading && (
          <div className="text-[10px] text-(--color-term-muted)">{t('autotrading.strategy.sectorsLoading', '載入類股中...')}</div>
        )}
        {!loading && sectors.length === 0 && (
          <div className="text-[10px] text-(--color-term-muted)">{t('autotrading.strategy.sectorsEmpty', '目前沒有可用類股')}</div>
        )}
        {sectors.map(sec => (
          <button
            key={sec.id}
            disabled={disabled || !!loadingSectorId}
            onClick={() => { void handleSelectSector(sec); }}
            className={cn(
              "px-3 py-1.5 text-[11px] font-bold tracking-widest rounded-sm border transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed",
              activeSectorId === sec.id 
                ? "bg-cyan-500/20 text-cyan-400 border-cyan-500/30 shadow-[0_0_10px_rgba(6,182,212,0.15)]" 
                : "bg-white/5 text-white/40 border-white/10 hover:text-white/80 hover:bg-white/10 hover:border-white/20"
            )}
          >
            {loadingSectorId === sec.id ? t('autotrading.strategy.loadingSymbols', '載入中...') : sec.name}
          </button>
        ))}
      </div>
    </div>
  );
}
