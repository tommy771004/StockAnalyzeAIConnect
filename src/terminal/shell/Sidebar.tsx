import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  BarChart3, Bell, Bot, CalendarDays, CircleHelp, FlaskConical, Landmark, LogOut,
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
  { id: 'dashboard',   icon: <Star className="h-4 w-4" />,              labelKey: 'nav.dashboard' },
  { id: 'alerts',      icon: <Bell className="h-4 w-4" />,              labelKey: 'nav.alerts' },
  { id: 'smartmoney',  icon: <Landmark className="h-4 w-4" />,          labelKey: 'nav.smartmoney' },
  { id: 'market',      icon: <CalendarDays className="h-4 w-4" />,      labelKey: 'nav.market' },
  { id: 'portfolio',   icon: <BarChart3 className="h-4 w-4" />,          labelKey: 'nav.portfolio' },
  { id: 'backtest',    icon: <FlaskConical className="h-4 w-4" />,       labelKey: 'nav.backtest' },
  { id: 'screener',    icon: <Target className="h-4 w-4" />,             labelKey: 'nav.screener' },
  { id: 'autotrading', icon: <Bot className="h-4 w-4" />,               labelKey: 'nav.autotrading' },
  { id: 'settings',    icon: <SlidersHorizontal className="h-4 w-4" />, labelKey: 'nav.settings' },
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
          className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm md:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Sidebar panel */}
      <aside
        className={cn(
          'flex flex-col items-center justify-between py-3 shrink-0 transition-transform duration-200',
          // Desktop: narrow icon rail with subtle right-side glow border
          'md:relative md:translate-x-0 md:w-[52px] md:z-auto md:h-full',
          'fixed top-0 left-0 h-full z-[70] w-52',
          isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
        )}
        style={{
          background: 'linear-gradient(180deg, rgba(8,11,16,0.98) 0%, rgba(10,14,22,0.99) 100%)',
          borderRight: '1px solid rgba(25,32,48,0.8)',
          boxShadow: isOpen ? '4px 0 24px rgba(0,0,0,0.5)' : 'inset -1px 0 0 rgba(245,158,11,0.04)',
        }}
      >
        {/* Mobile: drawer header */}
        <div className="md:hidden w-full flex items-center justify-between px-4 pb-3 border-b border-(--color-term-border) mb-2">
          <span
            className="text-[11px] font-bold tracking-[0.22em]"
            style={{
              background: 'linear-gradient(90deg, #f59e0b, #22d3ee)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            {t('sidebar.navigation')}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="text-(--color-term-muted) hover:text-(--color-term-text) hover:bg-white/5 p-1.5 rounded-md motion-safe:transition-colors focus-ring"
            aria-label={t('common.close')}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Nav items */}
        <div className="flex flex-col items-center gap-1 w-full px-2 flex-1">
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
                  'focus-ring relative flex items-center motion-safe:transition-all group',
                  // Mobile: full-width row
                  'w-full h-10 px-3 rounded-md gap-3',
                  // Desktop: centered icon square
                  'md:h-9 md:w-9 md:px-0 md:justify-center md:rounded-sm',
                  isActive
                    ? 'text-(--color-term-accent)'
                    : 'text-(--color-term-muted) hover:text-(--color-term-text)',
                )}
                style={isActive ? {
                  background: 'rgba(245,158,11,0.08)',
                  boxShadow: 'inset 2px 0 0 rgba(245,158,11,0.7)',
                } : undefined}
              >
                {/* Active glow halo (desktop) */}
                {isActive && (
                  <span
                    className="hidden md:block absolute inset-0 rounded-sm pointer-events-none"
                    style={{
                      boxShadow: '0 0 10px rgba(245,158,11,0.15), inset 0 0 6px rgba(245,158,11,0.05)',
                    }}
                  />
                )}

                {/* Hover background */}
                {!isActive && (
                  <span className="absolute inset-0 rounded-sm opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ background: 'rgba(255,255,255,0.04)' }}
                  />
                )}

                {/* Icon */}
                <span className={cn('relative z-10 shrink-0', isActive && 'drop-shadow-[0_0_6px_rgba(245,158,11,0.5)]')}>
                  {it.icon}
                </span>

                {/* Label — visible on mobile only */}
                <span className="md:hidden text-[12.5px] font-semibold tracking-wider relative z-10">{label}</span>
              </button>
            );
          })}
        </div>

        {/* Bottom actions */}
        <div className="flex flex-col items-center gap-1 w-full px-2 pt-2 border-t border-(--color-term-border)/50">
          <button
            type="button"
            title={t('sidebar.help')}
            onClick={() => handleNav('settings')}
            className="flex h-9 w-9 items-center justify-center text-(--color-term-muted) hover:text-(--color-term-text) hover:bg-white/5 motion-safe:transition-all focus-ring rounded-sm"
          >
            <CircleHelp className="h-4 w-4" />
          </button>
          <button
            type="button"
            title={t('sidebar.logout')}
            onClick={() => {
              fetch('/api/auth/logout', { method: 'POST' }).then(() => window.location.reload());
            }}
            className="flex h-9 w-9 items-center justify-center text-(--color-term-muted) hover:text-rose-400 hover:bg-rose-400/8 motion-safe:transition-all focus-ring rounded-sm"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </aside>
    </>
  );
}
