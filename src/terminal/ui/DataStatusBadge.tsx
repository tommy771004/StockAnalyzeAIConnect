import { AlertTriangle, Wifi, WifiOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/utils';

export type DataMode = 'LIVE' | 'DELAYED' | 'MOCK';

function formatUpdatedAt(iso: string | null, locale: string, noTimestamp: string, invalidTime: string): string {
  if (!iso) return noTimestamp;
  if (/^\d{2}:\d{2}:\d{2}$/.test(iso)) return iso;
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return invalidTime;
  return dt.toLocaleTimeString(locale, {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function DataStatusBadge({
  mode,
  lastUpdated,
  compact = false,
}: {
  mode: DataMode;
  lastUpdated: string | null;
  compact?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const tone = mode === 'LIVE'
    ? 'text-(--color-term-positive)'
    : mode === 'DELAYED'
      ? 'text-amber-300'
      : 'text-zinc-400';
  const locale = i18n.language.startsWith('zh') ? 'zh-TW' : 'en-US';
  const label = mode === 'LIVE'
    ? t('dataStatus.live', 'LIVE')
    : mode === 'DELAYED'
      ? t('dataStatus.delayed', 'DELAYED')
      : t('dataStatus.mock', 'MOCK');
  const formattedUpdatedAt = formatUpdatedAt(
    lastUpdated,
    locale,
    t('dataStatus.noTimestamp', 'NO TIMESTAMP'),
    t('dataStatus.invalidTime', 'INVALID TIME'),
  );

  return (
    <span className={cn('inline-flex items-center gap-1.5 tracking-widest', tone, compact ? 'text-[9px]' : 'text-[10px]')}>
      {mode === 'LIVE' ? (
        <>
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-(--color-term-positive)" />
          <Wifi className="h-3 w-3" />
        </>
      ) : mode === 'DELAYED' ? (
        <AlertTriangle className="h-3 w-3" />
      ) : (
        <WifiOff className="h-3 w-3" />
      )}
      <span>{label}</span>
      {!compact && <span className="text-(--color-term-muted)">· {formattedUpdatedAt}</span>}
    </span>
  );
}
