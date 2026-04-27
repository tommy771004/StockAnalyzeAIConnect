import React from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/utils';
import { Layers, Plus, X } from 'lucide-react';
import * as api from '../../services/api';

interface Props {
  selectedSymbols: string[];
  onSelectSymbols: (symbols: string[]) => void;
  disabled?: boolean;
}

type MarketBucket = 'TW' | 'US';

const TW_SYMBOL_RE = /(?:\.(TW|TWO)$)|^\d{4,6}$/i;
const US_SYMBOL_RE = /^[A-Z]{1,5}(?:[.-][A-Z]{1,2})?$/;

function normalizeSymbol(symbol: string): string {
  return symbol.trim().toUpperCase();
}

function normalizeTwSymbol(symbol: string): string {
  const normalized = normalizeSymbol(symbol);
  if (/^\d{4,6}$/.test(normalized)) return `${normalized}.TW`;
  return normalized;
}

function normalizeUsSymbol(symbol: string): string {
  const normalized = normalizeSymbol(symbol);
  const match = normalized.match(/^([A-Z]{1,5})(?:[.-]([A-Z]{1,2}))?$/);
  if (!match) return normalized;
  const [, root, suffix] = match;
  return suffix ? `${root}.${suffix}` : root;
}

function isTwSymbol(symbol: string): boolean {
  return TW_SYMBOL_RE.test(symbol.trim().toUpperCase());
}

function normalizeManagedSymbol(symbol: string): string {
  const normalized = normalizeSymbol(symbol);
  if (isTwSymbol(normalized)) return normalizeTwSymbol(normalized);
  if (US_SYMBOL_RE.test(normalized)) return normalizeUsSymbol(normalized);
  return normalized;
}

function uniqueSymbols(
  symbols: string[],
  normalizer: (symbol: string) => string = normalizeSymbol,
): string[] {
  return Array.from(new Set(symbols.map(normalizer).filter(Boolean)));
}

export function SectorSelector({ selectedSymbols, onSelectSymbols, disabled }: Props) {
  const { t } = useTranslation();
  const [sectors, setSectors] = React.useState<api.SectorItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [inputError, setInputError] = React.useState<string | null>(null);
  const [marketBucket, setMarketBucket] = React.useState<MarketBucket>('TW');
  const [usSymbolInput, setUsSymbolInput] = React.useState('');
  const [activeSectorId, setActiveSectorId] = React.useState<string | null>(null);
  const [loadingSectorId, setLoadingSectorId] = React.useState<string | null>(null);
  const [sectorSymbolsMap, setSectorSymbolsMap] = React.useState<Record<string, string[]>>({});

  const selectedTwSymbols = React.useMemo(
    () => uniqueSymbols(selectedSymbols.filter(isTwSymbol), normalizeTwSymbol),
    [selectedSymbols],
  );

  const selectedUsSymbols = React.useMemo(
    () => uniqueSymbols(selectedSymbols.filter((sym) => !isTwSymbol(sym)), normalizeUsSymbol),
    [selectedSymbols],
  );

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
      if (!symbols) return false;
      const twSymbols = uniqueSymbols(symbols.map(normalizeTwSymbol));
      return twSymbols.length > 0 &&
        twSymbols.length === selectedTwSymbols.length &&
        twSymbols.every((sym) => selectedTwSymbols.includes(sym));
    });
    setActiveSectorId(next?.id ?? null);
  }, [sectors, sectorSymbolsMap, selectedTwSymbols]);

  const handleSelectSector = async (sector: api.SectorItem) => {
    if (disabled) return;
    setError(null);
    setInputError(null);
    setLoadingSectorId(sector.id);
    try {
      let symbols = sectorSymbolsMap[sector.id];
      if (!symbols) {
        symbols = await api.getSectorSymbols(sector.id);
        setSectorSymbolsMap(prev => ({ ...prev, [sector.id]: symbols }));
      }
      const twSymbols = uniqueSymbols(symbols, normalizeTwSymbol);
      const nonTwSymbols = selectedSymbols
        .filter((sym) => !isTwSymbol(sym))
        .map(normalizeUsSymbol);
      onSelectSymbols(uniqueSymbols([...nonTwSymbols, ...twSymbols], normalizeManagedSymbol));
      setActiveSectorId(sector.id);
    } catch (e) {
      const msg = (e as Error).message || t('autotrading.strategy.sectorSymbolsLoadFailed', '查詢類股成分失敗');
      setError(msg);
    } finally {
      setLoadingSectorId(null);
    }
  };

  const handleAddUsSymbol = () => {
    if (disabled) return;
    setError(null);
    setInputError(null);
    const normalized = normalizeSymbol(usSymbolInput);

    if (!US_SYMBOL_RE.test(normalized)) {
      setInputError(t('autotrading.strategy.usSymbolInvalid', '代號格式錯誤，請輸入像 AAPL 或 BRK.B'));
      return;
    }

    const canonicalUsSymbol = normalizeUsSymbol(normalized);

    if (selectedSymbols.some((sym) => normalizeManagedSymbol(sym) === canonicalUsSymbol)) {
      setInputError(t('autotrading.strategy.usSymbolExists', '此標的已在監控清單中'));
      return;
    }

    onSelectSymbols(uniqueSymbols([...selectedSymbols, canonicalUsSymbol], normalizeManagedSymbol));
    setUsSymbolInput('');
  };

  const handleRemoveUsSymbol = (symbol: string) => {
    if (disabled) return;
    const canonicalUsSymbol = normalizeUsSymbol(symbol);
    const nextSymbols = selectedSymbols.filter((sym) => normalizeManagedSymbol(sym) !== canonicalUsSymbol);
    onSelectSymbols(uniqueSymbols(nextSymbols, normalizeManagedSymbol));
  };

  const handleChangeMarketBucket = (nextBucket: MarketBucket) => {
    setMarketBucket(nextBucket);
    setInputError(null);
  };

  return (
    <div className="space-y-3 bg-black/20 border border-white/5 p-4 rounded-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Layers className="h-3.5 w-3.5 text-cyan-400" />
          <span className="text-[10px] font-bold text-white/50 uppercase tracking-widest">{t('autotrading.strategy.sectorTargeting', 'Sector Targeting (類股篩選)')}</span>
        </div>
      </div>
      <div className="inline-flex rounded-sm border border-white/10 bg-black/30 p-1">
        <button
          type="button"
          disabled={disabled}
          onClick={() => handleChangeMarketBucket('TW')}
          className={cn(
            'px-3 py-1 text-[10px] font-bold tracking-widest rounded-sm border border-transparent transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
            marketBucket === 'TW' ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30' : 'text-white/45 hover:text-white/80'
          )}
        >
          {t('autotrading.strategy.marketTabs.tw', '台股（整股）')}
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => handleChangeMarketBucket('US')}
          className={cn(
            'px-3 py-1 text-[10px] font-bold tracking-widest rounded-sm border border-transparent transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
            marketBucket === 'US' ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30' : 'text-white/45 hover:text-white/80'
          )}
        >
          {t('autotrading.strategy.marketTabs.us', '美股（零股）')}
        </button>
      </div>
      {error && (
        <div className="text-[10px] text-rose-300 border border-rose-500/30 bg-rose-500/10 rounded-sm px-2 py-1.5">
          {error}
        </div>
      )}

      {marketBucket === 'TW' ? (
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
                'px-3 py-1.5 text-[11px] font-bold tracking-widest rounded-sm border transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed',
                activeSectorId === sec.id
                  ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30 shadow-[0_0_10px_rgba(6,182,212,0.15)]'
                  : 'bg-white/5 text-white/40 border-white/10 hover:text-white/80 hover:bg-white/10 hover:border-white/20'
              )}
            >
              {loadingSectorId === sec.id ? t('autotrading.strategy.loadingSymbols', '載入中...') : sec.name}
            </button>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {inputError && (
            <div className="text-[10px] text-rose-300 border border-rose-500/30 bg-rose-500/10 rounded-sm px-2 py-1.5">
              {inputError}
            </div>
          )}
          <label className="block text-[10px] font-bold text-white/50 uppercase tracking-widest">
            {t('autotrading.strategy.usInputLabel', '手動加入美股標的')}
          </label>
          <div className="flex items-center gap-2">
            <input
              value={usSymbolInput}
              disabled={disabled}
              onChange={(e) => setUsSymbolInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddUsSymbol();
                }
              }}
              placeholder={t('autotrading.strategy.usInputPlaceholder', '例如 AAPL / TSLA / BRK.B')}
              className="flex-1 h-9 px-3 text-[12px] bg-black/35 border border-white/10 rounded-sm text-white placeholder:text-white/30 focus:outline-none focus:border-cyan-500/40 disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <button
              type="button"
              disabled={disabled || !usSymbolInput.trim()}
              onClick={handleAddUsSymbol}
              className="h-9 px-3 inline-flex items-center gap-1 text-[11px] font-bold tracking-wider rounded-sm border border-cyan-500/30 bg-cyan-500/15 text-cyan-300 hover:bg-cyan-500/25 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus className="h-3.5 w-3.5" />
              {t('autotrading.strategy.addUsSymbol', '加入監控')}
            </button>
          </div>
          <p className="text-[10px] text-white/45">
            {t('autotrading.strategy.usInputHint', '可輸入美股代號（支援零股），例如 AAPL 或 BRK.B')}
          </p>
          {selectedUsSymbols.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-1">
              {selectedUsSymbols.map((sym) => (
                <button
                  type="button"
                  key={sym}
                  disabled={disabled}
                  onClick={() => handleRemoveUsSymbol(sym)}
                  title={t('autotrading.strategy.removeUsSymbol', '移除此美股標的')}
                  aria-label={t('autotrading.strategy.removeUsSymbol', '移除此美股標的')}
                  className="px-2 py-1 text-[10px] font-bold rounded border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 inline-flex items-center gap-1 hover:bg-rose-500/20 hover:border-rose-500/35 hover:text-rose-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span>{sym}</span>
                  <X className="h-3 w-3" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
