import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { formatTaipeiTime } from '../hooks/useMarketData';

interface FooterProps {
  /** Last data-fetch time, formatted as HH:MM:SS TST (passed from Layout) */
  lastUpdated?: string;
}

export function Footer({ lastUpdated }: FooterProps) {
  const { t } = useTranslation();

  // Live Taipei clock — ticks every second
  const [clock, setClock] = useState(() => formatTaipeiTime());
  useEffect(() => {
    const id = setInterval(() => setClock(formatTaipeiTime()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <footer className="flex h-8 shrink-0 items-center justify-between border-t border-(--color-term-border) bg-(--color-term-bg) px-5 text-[11px] tracking-wider text-(--color-term-muted)">
      <div className="flex items-center gap-4">
        <span className="text-(--color-term-accent) font-semibold">FIN-TERMINAL</span>
        <span>© {new Date().getFullYear()} FIN-TERMINAL</span>
        <span className="hidden sm:inline">|</span>
        <span className="hidden sm:inline">
          {t('footer.status')}：
          <span className="text-(--color-term-positive)">{t('footer.statusOk')}</span>
        </span>
        {/* Live Taiwan time clock */}
        <span className="hidden md:inline">|</span>
        <span className="hidden md:inline font-mono tabular-nums">
          <span className="text-(--color-term-accent)/70 mr-1">TST</span>
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
