/**
 * src/components/AutoTrading/CommanderTerminal.tsx
 * AI 指揮官終端：自然語言控制介面
 */
import React, { useState, useRef, useEffect } from 'react';
import { Terminal, Send, Zap, Bot, ShieldCheck, Ghost } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { CommanderLog } from './types';

export function CommanderTerminal() {
  const [input, setInput] = useState('');
  const [logs, setLogs] = useState<CommanderLog[]>([]);
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [logs]);

  const sendCommand = async () => {
    if (!input.trim() || loading) return;
    setLoading(true);
    
    const userCmd = input;
    setInput('');

    try {
      const res = await fetch('/api/autotrading/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: userCmd })
      });
      const data = await res.json();
      
      const newLog: CommanderLog = {
        id: Math.random().toString(36).substring(7),
        command: userCmd,
        actionTaken: data.ok ? data.actionTaken : `錯誤: ${data.error}`,
        status: data.ok ? 'SUCCESS' : 'FAILED',
        timestamp: new Date().toISOString()
      };
      
      setLogs(prev => [...prev, newLog]);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-black/40 border border-(--color-term-border) rounded-sm overflow-hidden font-mono">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-(--color-term-border) bg-white/5">
        <div className="flex items-center gap-2">
          <Terminal className="h-3.5 w-3.5 text-cyan-400" />
          <span className="text-[10px] font-bold tracking-widest text-cyan-400 uppercase">Strategic Commander Console</span>
        </div>
        <div className="flex items-center gap-4">
           <div className="flex items-center gap-1">
             <Ghost className="h-3 w-3 text-violet-400" />
             <span className="text-[8px] text-violet-400 uppercase">Shadow Vortex Active</span>
           </div>
           <div className="flex items-center gap-1">
             <ShieldCheck className="h-3 w-3 text-emerald-400" />
             <span className="text-[8px] text-emerald-400 uppercase">System Ready</span>
           </div>
        </div>
      </div>

      {/* Logs Area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3 scrollbar-hide">
        {logs.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center opacity-20">
            <Bot className="h-10 w-10 mb-2" />
            <div className="text-[10px] uppercase tracking-tighter">等待戰術指令...</div>
            <div className="text-[8px] mt-1 max-w-[200px]">嘗試輸入: "將 2330 止損設為 2%" 或 "開啟一個影子激進策略"</div>
          </div>
        )}
        {logs.map((log) => (
          <div key={log.id} className="space-y-1">
            <div className="flex items-start gap-2">
              <span className="text-cyan-500/50 mt-1 shrink-0">❯</span>
              <span className="text-[11px] text-cyan-300 break-words">{log.command}</span>
            </div>
            <div className={cn(
              "ml-4 p-2 rounded-sm text-[10px] leading-relaxed border",
              log.status === 'SUCCESS' ? "bg-emerald-500/5 border-emerald-500/20 text-emerald-300" : "bg-rose-500/5 border-rose-500/20 text-rose-300"
            )}>
              <div className="flex items-center gap-1.5 mb-1 opacity-50">
                <Zap className="h-2.5 w-2.5" />
                <span className="text-[8px] uppercase">{log.status === 'SUCCESS' ? 'Execution Success' : 'Execution Failed'}</span>
                <span className="ml-auto text-[7px]">{new Date(log.timestamp).toLocaleTimeString()}</span>
              </div>
              {log.actionTaken}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex items-center gap-2 text-cyan-500/50 animate-pulse ml-4">
            <div className="h-1 w-1 bg-cyan-500 rounded-full" />
            <span className="text-[9px]">AI 指揮官正在解析戰術...</span>
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="p-2 border-t border-(--color-term-border) bg-black/60 flex items-center gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && sendCommand()}
          placeholder="輸入戰術指令..."
          className="flex-1 bg-transparent border-none text-[11px] text-white placeholder-white/20 focus:outline-none"
        />
        <button 
          onClick={sendCommand}
          disabled={loading || !input.trim()}
          className="p-1.5 rounded-sm hover:bg-white/10 text-cyan-400 disabled:opacity-20 transition-colors"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
