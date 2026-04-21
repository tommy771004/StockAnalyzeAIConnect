import React, { createContext, useContext, useState } from 'react';
import { Bell } from 'lucide-react';

interface Notification {
  id: number;
  title: string;
  message: string;
  time: string;
  read: boolean;
}

interface NotificationContextType {
  notifications: Notification[];
  unreadCount: number;
  markAsRead: (id: number) => void;
  addNotification: (title: string, message: string) => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const unreadCount = notifications.filter(n => !n.read).length;

  const markAsRead = (id: number) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  };

  const addNotification = (title: string, message: string) => {
    const n: Notification = {
      id: Date.now(),
      title,
      message,
      time: new Date().toLocaleTimeString(),
      read: false
    };
    setNotifications(prev => [n, ...prev]);
  };

  return (
    <NotificationContext.Provider value={{ notifications, unreadCount, markAsRead, addNotification }}>
      {children}
    </NotificationContext.Provider>
  );
};

export const NotificationBell: React.FC<{ onClick?: () => void }> = ({ onClick }) => {
  const context = useContext(NotificationContext);
  const count = context?.unreadCount ?? 0;

  return (
    <button
      type="button"
      aria-label="通知中心"
      onClick={onClick}
      className="relative p-2 text-gray-400 hover:text-white cursor-pointer"
    >
      <Bell size={20} />
      {count > 0 && (
        <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-[10px] font-bold text-black">
          {count}
        </span>
      )}
    </button>
  );
};

export default function NotificationCenter({ open, onClose }: { open: boolean, onClose: () => void }) {
  const context = useContext(NotificationContext);
  if (!context || !open) return null;

  return (
    <div className="fixed top-16 right-2 sm:right-4 z-50 p-4 bg-gray-900 border border-gray-800 rounded-xl shadow-2xl w-[calc(100vw-1rem)] sm:w-80 max-h-96 overflow-auto">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-sm font-bold text-white">通知中心</h3>
        <button onClick={onClose} className="text-gray-500 hover:text-white">✕</button>
      </div>
      {context.notifications.length === 0 ? (
        <p className="text-xs text-gray-500 text-center py-8">目前沒有通知</p>
      ) : (
        <div className="flex flex-col gap-3">
          {context.notifications.map(n => (
            <div key={n.id} className={`p-3 rounded-lg border ${n.read ? 'bg-gray-800/30 border-gray-800' : 'bg-emerald-500/5 border-emerald-500/20'}`}>
              <div className="flex justify-between items-start mb-1">
                <span className="text-xs font-bold text-white">{n.title}</span>
                <span className="text-[10px] text-gray-500">{n.time}</span>
              </div>
              <p className="text-[11px] text-gray-400 leading-relaxed">{n.message}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
