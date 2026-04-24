import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertTriangle, Activity, CheckCircle, XCircle } from 'lucide-react';
import { safeCn } from '../utils/helpers';

interface LogEntry {
  id: string;
  timestamp: string;
  type: 'info' | 'success' | 'warning' | 'error';
  message: string;
  source: 'SYSTEM' | 'AGENT' | 'RISK_CONTROL';
}

// Global log bus (simple implementation for cross-component logging)
export const logBus: LogEntry[] = [];
type LogListener = () => void;
const listeners: LogListener[] = [];

export const pushLog = (type: LogEntry['type'], source: LogEntry['source'], message: string) => {
  const entry: LogEntry = {
    id: Date.now().toString() + Math.random().toString(36).substring(7),
    timestamp: new Date().toISOString(),
    type,
    source,
    message
  };
  logBus.push(entry);
  if (logBus.length > 100) logBus.shift(); // Keep last 100 logs
  listeners.forEach(fn => fn());
};

const watchLogs = (fn: LogListener) => {
  listeners.push(fn);
  return () => {
    const idx = listeners.indexOf(fn);
    if (idx > -1) listeners.splice(idx, 1);
  };
};

export default function TradeLogger() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLogs([...logBus]);
    return watchLogs(() => setLogs([...logBus]));
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  const getIcon = (type: LogEntry['type']) => {
    switch(type) {
      case 'info': return <Activity size={12} className="text-blue-400" />;
      case 'success': return <CheckCircle size={12} className="text-emerald-400" />;
      case 'warning': return <AlertTriangle size={12} className="text-amber-400" />;
      case 'error': return <XCircle size={12} className="text-rose-400" />;
    }
  };

  const getColor = (type: LogEntry['type']) => {
    switch(type) {
      case 'info': return "text-blue-300";
      case 'success': return "text-emerald-300";
      case 'warning': return "text-amber-300";
      case 'error': return "text-rose-300";
    }
  };

  const getSourceColor = (source: LogEntry['source']) => {
    switch(source) {
      case 'SYSTEM': return "text-zinc-500";
      case 'AGENT': return "text-indigo-400";
      case 'RISK_CONTROL': return "text-rose-400";
    }
  };

  return (
    <div className="flex flex-col h-full bg-black/80 rounded-2xl border border-white/5 overflow-hidden">
      <div className="flex items-center gap-2 p-2 border-b border-white/10 bg-black/50">
        <Activity size={14} className="text-zinc-500" />
        <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Live Trade Logger</span>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-2 space-y-1 font-mono text-[10px] sm:text-xs">
        <AnimatePresence initial={false}>
          {logs.map((log) => (
            <motion.div
              key={log.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-start gap-2 py-0.5"
            >
              <div className="shrink-0 mt-0.5">{getIcon(log.type)}</div>
              <div className="flex flex-wrap gap-x-2 gap-y-0.5 leading-tight">
                <span className="text-zinc-600">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
                <span className={safeCn("font-bold", getSourceColor(log.source))}>[{log.source}]</span>
                <span className={getColor(log.type)}>{log.message}</span>
              </div>
            </motion.div>
          ))}
          {logs.length === 0 && (
            <div className="text-zinc-600 text-center py-4 italic">Awaiting events...</div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
