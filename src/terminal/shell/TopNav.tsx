import { Bell, CircleUserRound, Search, Settings } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { TerminalView } from '../types';

interface Tab {
  id: TerminalView;
  label: string;
}

const tabs: Tab[] = [
  { id: 'dashboard', label: '儀表板' },
  { id: 'market', label: '市場' },
  { id: 'crypto', label: '加密貨幣' },
  { id: 'portfolio', label: '投資組合' },
  { id: 'research', label: '研究' },
  { id: 'news', label: '新聞' },
];

interface TopNavProps {
  active: TerminalView;
  onChange: (view: TerminalView) => void;
  searchPlaceholder?: string;
}

export function TopNav({ active, onChange, searchPlaceholder = 'SEARCH...' }: TopNavProps) {
  return (
    <header className="flex h-14 items-center gap-6 border-b border-(--color-term-border) bg-(--color-term-bg) px-5">
      <a
        className="font-mono text-[17px] font-bold tracking-[0.22em] text-(--color-term-accent)"
        href="#"
        onClick={(e) => {
          e.preventDefault();
          onChange('dashboard');
        }}
      >
        FIN-TERMINAL
      </a>

      <nav className="flex h-full items-end gap-6">
        {tabs.map((tab) => {
          const isActive = tab.id === active;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onChange(tab.id)}
              className={cn(
                'relative h-full pt-4 pb-2 text-[13px] tracking-wider transition-colors',
                isActive
                  ? 'text-(--color-term-accent)'
                  : 'text-(--color-term-text)/70 hover:text-(--color-term-text)',
              )}
            >
              {tab.label}
              {isActive && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-(--color-term-accent)" />
              )}
            </button>
          );
        })}
      </nav>

      <div className="ml-auto flex items-center gap-3">
        <div className="relative hidden md:block">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-(--color-term-muted)" />
          <input
            className="h-8 w-56 border border-(--color-term-border) bg-(--color-term-surface) pl-7 pr-2 text-[12px] tracking-widest text-(--color-term-text) placeholder:text-(--color-term-muted) focus:border-(--color-term-accent) focus:outline-none"
            placeholder={searchPlaceholder}
          />
        </div>
        <IconButton>
          <CircleUserRound className="h-4 w-4" />
        </IconButton>
        <IconButton>
          <Bell className="h-4 w-4" />
        </IconButton>
        <IconButton>
          <Settings className="h-4 w-4" />
        </IconButton>
      </div>
    </header>
  );
}

function IconButton({ children }: { children: React.ReactNode }) {
  return (
    <button
      type="button"
      className="flex h-8 w-8 items-center justify-center border border-(--color-term-border) text-(--color-term-muted) hover:border-(--color-term-accent) hover:text-(--color-term-accent)"
    >
      {children}
    </button>
  );
}
