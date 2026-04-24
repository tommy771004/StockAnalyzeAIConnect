import {
  BarChart3,
  Bell,
  CalendarDays,
  CircleHelp,
  LogOut,
  SlidersHorizontal,
  Star,
} from 'lucide-react';
import type { TerminalView } from '../types';
import { cn } from '../../lib/utils';

interface SidebarProps {
  active: TerminalView;
  onChange: (next: TerminalView) => void;
}

const items: Array<{ id: TerminalView; icon: React.ReactNode; label: string }> = [
  { id: 'dashboard', icon: <Star className="h-4 w-4" />, label: 'Dashboard' },
  { id: 'alerts', icon: <Bell className="h-4 w-4" />, label: 'Alerts' },
  { id: 'market', icon: <CalendarDays className="h-4 w-4" />, label: 'Markets' },
  { id: 'portfolio', icon: <BarChart3 className="h-4 w-4" />, label: 'Portfolio' },
  { id: 'settings', icon: <SlidersHorizontal className="h-4 w-4" />, label: 'Settings' },
];

export function Sidebar({ active, onChange }: SidebarProps) {
  return (
    <aside className="flex w-12 shrink-0 flex-col items-center justify-between border-r border-(--color-term-border) bg-(--color-term-bg) py-4">
      <div className="flex flex-col items-center gap-4">
        {items.map((it) => {
          const isActive = active === it.id;
          return (
            <button
              key={it.id}
              type="button"
              title={it.label}
              onClick={() => onChange(it.id)}
              className={cn(
                'flex h-8 w-8 items-center justify-center border text-(--color-term-muted) transition-colors hover:text-(--color-term-text)',
                isActive
                  ? 'border-(--color-term-accent) text-(--color-term-accent)'
                  : 'border-transparent',
              )}
            >
              {it.icon}
            </button>
          );
        })}
      </div>
      <div className="flex flex-col items-center gap-4 text-(--color-term-muted)">
        <button
          type="button"
          title="Help"
          onClick={() => onChange('settings')}
          className="flex h-8 w-8 items-center justify-center hover:text-(--color-term-text)"
        >
          <CircleHelp className="h-4 w-4" />
        </button>
        <button
          type="button"
          title="Logout"
          onClick={() => { fetch('/api/auth/logout', { method: 'POST' }).then(() => window.location.reload()); }}
          className="flex h-8 w-8 items-center justify-center hover:text-(--color-term-text) hover:text-rose-400"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </aside>
  );
}
