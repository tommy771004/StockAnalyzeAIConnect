import type { ReactNode } from 'react';
import type { TerminalView } from '../types';
import { TopNav } from './TopNav';
import { TickerTape } from './TickerTape';
import { Sidebar } from './Sidebar';
import { Footer } from './Footer';
import { indexTickers } from '../mockData';

interface LayoutProps {
  active: TerminalView;
  onChange: (view: TerminalView) => void;
  searchPlaceholder?: string;
  children: ReactNode;
}

export function Layout({ active, onChange, searchPlaceholder, children }: LayoutProps) {
  return (
    <div className="flex h-screen w-screen flex-col bg-(--color-term-bg) text-(--color-term-text)">
      <TopNav active={active} onChange={onChange} searchPlaceholder={searchPlaceholder} />
      <TickerTape items={indexTickers} />
      <div className="flex min-h-0 flex-1">
        <Sidebar active={active} />
        <main className="min-h-0 flex-1 overflow-hidden p-3">{children}</main>
      </div>
      <Footer />
    </div>
  );
}
