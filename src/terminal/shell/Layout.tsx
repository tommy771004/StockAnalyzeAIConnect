import type { ReactNode } from 'react';
import type { TerminalView } from '../types';
import { TopNav } from './TopNav';
import { TickerTape } from './TickerTape';
import { Sidebar } from './Sidebar';
import { useState } from 'react';
import { Footer } from './Footer';
import { AgentPanel } from './AgentPanel';
import { indexTickers } from '../mockData';

interface LayoutProps {
  active: TerminalView;
  onChange: (view: TerminalView) => void;
  searchPlaceholder?: string;
  children: ReactNode;
}

export function Layout({ active, onChange, searchPlaceholder, children }: LayoutProps) {
  const [isAgentOpen, setIsAgentOpen] = useState(false);
  const toggleAgent = () => setIsAgentOpen((prev) => !prev);

  return (
    <div className="flex h-screen w-screen flex-col bg-(--color-term-bg) text-(--color-term-text)">
      <TopNav active={active} onChange={onChange} searchPlaceholder={searchPlaceholder} onToggleAgent={toggleAgent} />
      <TickerTape items={indexTickers} />
      <div className="flex min-h-0 flex-1 relative">
        <Sidebar active={active} />
        <main className="min-h-0 flex-1 overflow-hidden p-3">{children}</main>
        
        {/* The sliding Agent Panel */}
        <AgentPanel isOpen={isAgentOpen} onClose={() => setIsAgentOpen(false)} />
      </div>
      <Footer />
    </div>
  );
}
