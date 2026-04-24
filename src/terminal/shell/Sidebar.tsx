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
}

const items: Array<{ id: string; icon: React.ReactNode; label: string; match?: TerminalView[] }> = [
  { id: 'watchlist', icon: <Star className="h-4 w-4" />, label: 'Watchlist' },
  { id: 'alerts', icon: <Bell className="h-4 w-4" />, label: 'Alerts' },
  { id: 'calendar', icon: <CalendarDays className="h-4 w-4" />, label: 'Calendar', match: ['research'] },
  { id: 'performance', icon: <BarChart3 className="h-4 w-4" />, label: 'Performance' },
  { id: 'tools', icon: <SlidersHorizontal className="h-4 w-4" />, label: 'Tools' },
];

export function Sidebar({ active }: SidebarProps) {
  return (
    <aside className="flex w-12 shrink-0 flex-col items-center justify-between border-r border-(--color-term-border) bg-(--color-term-bg) py-4">
      <div className="flex flex-col items-center gap-4">
        {items.map((it) => {
          const isActive = it.match?.includes(active);
          return (
            <button
              key={it.id}
              type="button"
              title={it.label}
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
          className="flex h-8 w-8 items-center justify-center hover:text-(--color-term-text)"
        >
          <CircleHelp className="h-4 w-4" />
        </button>
        <button
          type="button"
          title="Logout"
          className="flex h-8 w-8 items-center justify-center hover:text-(--color-term-text)"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </aside>
  );
}
