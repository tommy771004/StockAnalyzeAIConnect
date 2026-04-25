import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  BarChart3, Bell, CalendarDays, CircleHelp, FlaskConical, LogOut,
  SlidersHorizontal, Star, Target, X,
} from 'lucide-react';
import type { TerminalView } from '../types';
import { cn } from '../../lib/utils';

interface SidebarProps {
  active: TerminalView;
  onChange: (next: TerminalView) => void;
  isOpen: boolean;
  onClose: () => void;
}

const NAV_ITEMS: Array<{ id: TerminalView; icon: React.ReactNode; labelKey: string }> = [
  { id: 'dashboard', icon: <Star className="h-4 w-4" />,            labelKey: 'nav.dashboard' },
  { id: 'alerts',    icon: <Bell className="h-4 w-4" />,            labelKey: 'nav.alerts' },
  { id: 'market',    icon: <CalendarDays className="h-4 w-4" />,    labelKey: 'nav.market' },
  { id: 'portfolio', icon: <BarChart3 className="h-4 w-4" />,        labelKey: 'nav.portfolio' },
  { id: 'backtest',  icon: <FlaskConical className="h-4 w-4" />,     labelKey: 'nav.backtest' },
  { id: 'screener',  icon: <Target className="h-4 w-4" />,           labelKey: 'nav.screener' },
  { id: 'settings',  icon: <SlidersHorizontal className="h-4 w-4" />, labelKey: 'nav.settings' },
];

export function Sidebar({ active, onChange, isOpen, onClose }: SidebarProps) {
  const { t } = useTranslation();

  const handleNav = (id: TerminalView) => {
    onChange(id);
    onClose();
  };

  return (
    <>
      {/* Mobile backdrop overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Sidebar panel */}
      <aside
        className={cn(
          'flex flex-col items-center justify-between border-r border-(--color-term-border) bg-(--color-term-bg) py-4 shrink-0 transition-transform duration-200',
          'md:relative md:translate-x-0 md:w-12 md:z-auto',
          'fixed top-0 left-0 h-full z-50 w-48',
          isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
        )}
      >
        {/* Mobile: drawer header */}
        <div className="md:hidden w-full flex items-center justify-between px-4 pb-4 border-b border-(--color-term-border) mb-2">
          <span className="text-[11px] font-bold tracking-[0.2em] text-(--color-term-accent)">
            {t('sidebar.navigation')}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="text-(--color-term-muted) hover:text-(--color-term-text)"
            aria-label={t('common.close')}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Nav items */}
        <div className="flex flex-col items-center md:items-center gap-2 w-full px-2 md:px-0 flex-1">
          {NAV_ITEMS.map((it) => {
            const isActive = active === it.id;
            const label = t(it.labelKey);
            return (
              <button
                key={it.id}
                type="button"
                title={label}
                onClick={() => handleNav(it.id)}
                className={cn(
                  'flex items-center gap-3 transition-colors group',
                  'md:h-8 md:w-8 md:justify-center md:border',
                  'w-full h-10 px-3 md:px-0 rounded-sm md:rounded-none',
                  isActive
                    ? 'border-(--color-term-accent) text-(--color-term-accent) bg-(--color-term-accent)/5'
                    : 'border-transparent text-(--color-term-muted) hover:text-(--color-term-text) hover:bg-white/5',
                )}
              >
                {it.icon}
                {/* Label — visible on mobile only */}
                <span className="md:hidden text-[12px] font-semibold tracking-widest">{label}</span>
              </button>
            );
          })}
        </div>

        {/* Bottom actions */}
        <div className="flex flex-col items-center gap-2 w-full px-2 md:px-0">
          <button
            type="button"
            title={t('sidebar.help')}
            onClick={() => handleNav('settings')}
            className="flex h-8 w-8 items-center justify-center text-(--color-term-muted) hover:text-(--color-term-text) transition-colors"
          >
            <CircleHelp className="h-4 w-4" />
          </button>
          <button
            type="button"
            title={t('sidebar.logout')}
            onClick={() => {
              fetch('/api/auth/logout', { method: 'POST' }).then(() => window.location.reload());
            }}
            className="flex h-8 w-8 items-center justify-center text-(--color-term-muted) hover:text-rose-400 transition-colors"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </aside>
    </>
  );
}
