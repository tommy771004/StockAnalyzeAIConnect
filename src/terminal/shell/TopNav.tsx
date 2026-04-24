import React from 'react';
import { Bell, CircleUserRound, Search, BrainCircuit, Menu, Target, Languages } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/utils';
import type { TerminalView } from '../types';

interface Tab {
  id: TerminalView;
  label: string;
}

const tabs: Tab[] = [
  { id: 'dashboard', label: 'dashboard' },
  { id: 'market',    label: 'market' },
  { id: 'crypto',    label: 'crypto' },
  { id: 'portfolio', label: 'portfolio' },
  { id: 'research',  label: 'research' },
  { id: 'screener',  label: 'screener' },
  { id: 'news',      label: 'news' },
];

interface TopNavProps {
  active: TerminalView;
  onChange: (view: TerminalView) => void;
  searchPlaceholder?: string;
  onToggleAgent?: () => void;
  onToggleSidebar?: () => void;
}

export function TopNav({
  active,
  onChange,
  searchPlaceholder = 'SEARCH...',
  onToggleAgent,
  onToggleSidebar,
}: TopNavProps) {
  const { t, i18n } = useTranslation();

  const toggleLanguage = () => {
    const nextLng = i18n.language.startsWith('zh') ? 'en' : 'zh';
    i18n.changeLanguage(nextLng);
  };

  return (
    <header className="flex h-14 items-center gap-3 border-b border-(--color-term-border) bg-(--color-term-bg) px-3 md:px-5 shrink-0 relative">
      {/* Mobile: Hamburger */}
      <button
        type="button"
        onClick={onToggleSidebar}
        className="flex md:hidden h-8 w-8 items-center justify-center text-(--color-term-muted) hover:text-(--color-term-accent) transition-colors"
        aria-label="Toggle sidebar"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Logo */}
      <a
        className="font-mono text-[15px] md:text-[17px] font-bold tracking-[0.22em] text-(--color-term-accent) shrink-0 relative group"
        href="#"
        onClick={(e) => { e.preventDefault(); onChange('dashboard'); }}
      >
        FIN-TERMINAL
        {/* Subtle glow underline on hover */}
        <span className="absolute -bottom-0.5 left-0 right-0 h-px bg-(--color-term-accent) opacity-0 group-hover:opacity-60 transition-opacity" />
      </a>

      {/* Desktop tab nav */}
      <nav className="hidden md:flex h-full items-end gap-1 ml-2">
        {tabs.map((tab) => {
          const isActive = tab.id === active;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onChange(tab.id)}
              className={cn(
                'relative h-full px-3 pt-4 pb-2 text-[12px] tracking-wider transition-all whitespace-nowrap',
                isActive
                  ? 'text-(--color-term-accent)'
                  : 'text-(--color-term-text)/60 hover:text-(--color-term-text)',
              )}
            >
              {/* Special icon for screener */}
              {tab.id === 'screener' && (
                <Target className="inline h-3 w-3 mr-1 -mt-0.5" />
              )}
              {t(`nav.${tab.id}`)}
              {isActive && (
                <>
                  <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-(--color-term-accent)" />
                  {/* Glow effect on active tab */}
                  <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-3/4 h-4 bg-(--color-term-accent)/10 blur-sm pointer-events-none" />
                </>
              )}
            </button>
          );
        })}
      </nav>

      {/* Right-side actions */}
      <div className="ml-auto flex items-center gap-2">
        {/* Desktop search */}
        <div className="relative hidden lg:block">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-(--color-term-muted)" />
          <input
            className="h-8 w-48 xl:w-56 border border-(--color-term-border) bg-(--color-term-surface) pl-7 pr-2 text-[12px] tracking-widest text-(--color-term-text) placeholder:text-(--color-term-muted) focus:border-(--color-term-accent) focus:outline-none transition-colors"
            placeholder={searchPlaceholder}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const sym = (e.target as HTMLInputElement).value.trim().toUpperCase();
                if (sym) {
                  window.location.hash = 'dashboard';
                  window.dispatchEvent(new CustomEvent('symbol-search', { detail: sym }));
                  (e.target as HTMLInputElement).value = '';
                }
              }
            }}
          />
        </div>

        {/* Language toggle */}
        <IconButton onClick={toggleLanguage} title={t('settings.language', 'Language')}>
          <div className="flex items-center justify-center font-bold text-[10px]">
            {i18n.language.startsWith('zh') ? 'EN' : '中'}
          </div>
        </IconButton>

        {/* AI Agent toggle */}
        <IconButton onClick={onToggleAgent} title={t('topnav.aiAgent')}>
          <BrainCircuit className="h-4 w-4" />
        </IconButton>

        {/* Alerts */}
        <IconButton
          onClick={() => onChange('alerts')}
          className="relative"
          title={t('topnav.alerts')}
        >
          <Bell className="h-4 w-4" />
          <span className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-rose-500 animate-pulse border border-(--color-term-bg)" />
        </IconButton>

        {/* Settings / account */}
        <button
          onClick={() => onChange('settings')}
          className={cn(
            'hidden sm:flex items-center gap-2 px-2 py-1 border border-(--color-term-border) hover:border-(--color-term-accent) hover:text-(--color-term-accent) transition-all group',
            active === 'settings' && 'border-(--color-term-accent) text-(--color-term-accent) bg-(--color-term-accent)/5',
          )}
          title={t('settings.title')}
        >
          <CircleUserRound className="h-4 w-4 group-hover:scale-110 transition-transform" />
          <span className="text-[10px] font-bold tracking-widest hidden xl:block">{t('topnav.settings')}</span>
        </button>
      </div>
    </header>
  );
}

function IconButton({
  children,
  onClick,
  className,
  title,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        'flex h-8 w-8 items-center justify-center border border-(--color-term-border) text-(--color-term-muted) hover:border-(--color-term-accent) hover:text-(--color-term-accent) transition-all',
        className,
      )}
    >
      {children}
    </button>
  );
}
