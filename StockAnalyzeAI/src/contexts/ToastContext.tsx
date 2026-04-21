import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';

type ToastType = 'success' | 'error' | 'info';

interface Toast {
  id: number;
  msg: string;
  type: ToastType;
}

interface ToastContextType {
  toast: (msg: string, type?: ToastType) => void;
  toasts: Toast[];
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  // Cleanup all timers on unmount
  useEffect(() => {
    const timers = timersRef.current;
    return () => { timers.forEach(t => clearTimeout(t)); timers.clear(); };
  }, []);

  const toast = useCallback((msg: string, type: ToastType = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, msg, type }]);
    const timer = setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
      timersRef.current.delete(id);
    }, 3000);
    timersRef.current.set(id, timer);
  }, []);

  return (
    <ToastContext.Provider value={{ toast, toasts }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2.5 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`flex items-center gap-2.5 px-4 py-3 rounded-xl text-sm font-bold shadow-2xl backdrop-blur-md border pointer-events-auto animate-[slideInRight_0.3s_ease-out] ${
              t.type === 'success' ? 'bg-emerald-500/90 text-white border-emerald-400/30' :
              t.type === 'error' ? 'bg-rose-500/90 text-white border-rose-400/30' : 'bg-zinc-800/90 text-white border-zinc-700/30'
            }`}
          >
            <span className="shrink-0">
              {t.type === 'success' ? '\u2713' : t.type === 'error' ? '\u2717' : '\u2139'}
            </span>
            {t.msg}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within ToastProvider');
  return context;
};
