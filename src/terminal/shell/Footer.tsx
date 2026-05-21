import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { formatTaipeiTime } from '../hooks/useMarketData';

interface FooterProps {
  /** Last data-fetch time, formatted as HH:MM:SS TST (passed from Layout) */
  lastUpdated?: string;
}

export function Footer({ lastUpdated }: FooterProps) {
  const { t } = useTranslation();
  const companyName = 'Stock AI Connect';

  // Live Taipei clock — ticks every second
  const [clock, setClock] = useState(() => formatTaipeiTime());
  useEffect(() => {
    const id = setInterval(() => setClock(formatTaipeiTime()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <footer
      className="flex h-9 shrink-0 items-center justify-between px-5 text-[11px] tracking-wider text-(--color-term-muted)"
      style={{
        borderTop: '1px solid rgba(25,32,48,0.8)',
        background: 'linear-gradient(180deg, rgba(8,11,16,0.95) 0%, rgba(8,11,16,1) 100%)',
        boxShadow: 'inset 0 1px 0 rgba(245,158,11,0.05)',
      }}
    >
      <div className="flex items-center gap-4">
        <span
          className="font-semibold font-sans text-[11.5px]"
          style={{
            background: 'linear-gradient(90deg, #f59e0b, #22d3ee)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}
        >
          {companyName}
        </span>
        <span className="text-[10px]">© {new Date().getFullYear()} {companyName}</span>
        <span className="hidden sm:inline text-(--color-term-border-strong)/60">|</span>
        <span className="hidden sm:inline">
          {t('footer.status')}{t('footer.statusDelimiter', ': ')}
          <span className="inline-flex items-center gap-1 ml-1">
            {/* Animated status dot */}
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500 pulse-glow-green" />
            <span className="text-emerald-400">{t('footer.statusOk')}</span>
          </span>
        </span>
        {/* Live Taiwan time clock */}
        <span className="hidden md:inline text-(--color-term-border-strong)/60">|</span>
        <span className="hidden md:inline font-mono tabular-nums text-[10.5px]">
          <span className="text-(--color-term-accent)/60 mr-1">{t('footer.timezoneLabel', 'TST')}</span>
          {clock}
        </span>
      </div>
      <div className="flex items-center gap-5">
        <a
          href="/terms"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-(--color-term-text) transition-colors"
        >
          {t('footer.terms')}
        </a>
        <a
          href="/privacy"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-(--color-term-text) transition-colors"
        >
          {t('footer.privacy')}
        </a>
        <a
          href="mailto:support@fin-terminal.io"
          className="hover:text-(--color-term-text) transition-colors"
        >
          {t('footer.support')}
        </a>
      </div>
    </footer>
  );
}
