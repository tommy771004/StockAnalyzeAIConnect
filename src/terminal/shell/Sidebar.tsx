import React from 'react';
import {
  BarChart3,
  Bell,
  CalendarDays,
  CircleHelp,
  LogOut,
  SlidersHorizontal,
  Star,
  Target,
  X,
} from 'lucide-react';
import type { TerminalView } from '../types';
import { cn } from '../../lib/utils';

interface SidebarProps {
  active: TerminalView;
  onChange: (next: TerminalView) => void;
  isOpen: boolean;
  onClose: () => void;
}

const items: Array<{ id: TerminalView; icon: React.ReactNode; label: string }> = [
  { id: 'dashboard', icon: <Star className="h-4 w-4" />,           label: 'Dashboard' },
  { id: 'alerts',    icon: <Bell className="h-4 w-4" />,           label: 'Alerts' },
  { id: 'market',    icon: <CalendarDays className="h-4 w-4" />,   label: 'Markets' },
  { id: 'portfolio', icon: <BarChart3 className="h-4 w-4" />,      label: 'Portfolio' },
  { id: 'screener',  icon: <Target className="h-4 w-4" />,         label: '選股器' },
  { id: 'settings',  icon: <SlidersHorizontal className="h-4 w-4" />, label: 'Settings' },
];

export function Sidebar({ active, onChange, isOpen, onClose }: SidebarProps) {
  const handleNav = (id: TerminalView) => {
    onChange(id);
    onClose(); // auto-close on mobile after navigation
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
          // Base styles
          'flex flex-col items-center justify-between border-r border-(--color-term-border) bg-(--color-term-bg) py-4 shrink-0 transition-transform duration-200',
          // Desktop: always visible narrow strip
          'md:relative md:translate-x-0 md:w-12 md:z-auto',
          // Mobile: fixed drawer sliding in from left
          'fixed top-0 left-0 h-full z-50 w-48',
          isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
        )}
      >
        {/* Mobile: drawer header with close button */}
        <div className="md:hidden w-full flex items-center justify-between px-4 pb-4 border-b border-(--color-term-border) mb-2">
          <span className="text-[11px] font-bold tracking-[0.2em] text-(--color-term-accent)">
            NAVIGATION
          </span>
          <button
            type="button"
            onClick={onClose}
            className="text-(--color-term-muted) hover:text-(--color-term-text)"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Nav items */}
        <div className="flex flex-col items-center md:items-center gap-2 w-full px-2 md:px-0 flex-1">
          {items.map((it) => {
            const isActive = active === it.id;
            return (
              <button
                key={it.id}
                type="button"
                title={it.label}
                onClick={() => handleNav(it.id)}
                className={cn(
                  // Shared
                  'flex items-center gap-3 transition-colors group',
                  // Desktop: icon-only square button
                  'md:h-8 md:w-8 md:justify-center md:border',
                  // Mobile: full-width row with label
                  'w-full h-10 px-3 md:px-0 rounded-sm md:rounded-none',
                  isActive
                    ? 'border-(--color-term-accent) text-(--color-term-accent) bg-(--color-term-accent)/5'
                    : 'border-transparent text-(--color-term-muted) hover:text-(--color-term-text) hover:bg-white/5',
                )}
              >
                {it.icon}
                {/* Label — visible on mobile only */}
                <span className="md:hidden text-[12px] font-semibold tracking-widest">
                  {it.label}
                </span>
              </button>
            );
          })}
        </div>

        {/* Bottom actions */}
        <div className="flex flex-col items-center gap-2 w-full px-2 md:px-0">
          <button
            type="button"
            title="Help"
            onClick={() => handleNav('settings')}
            className="flex h-8 w-8 items-center justify-center text-(--color-term-muted) hover:text-(--color-term-text) transition-colors"
          >
            <CircleHelp className="h-4 w-4" />
          </button>
          <button
            type="button"
            title="Logout"
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
