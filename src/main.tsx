import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { AuthProvider } from './contexts/AuthContext';
import { SettingsProvider } from './contexts/SettingsContext';
import { ToastProvider } from './contexts/ToastContext';
import { SubscriptionProvider } from './contexts/SubscriptionContext';
import './styles.css';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Missing #root element');

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <AuthProvider>
      <SettingsProvider>
        <SubscriptionProvider>
          <ToastProvider>
            <App />
          </ToastProvider>
        </SubscriptionProvider>
      </SettingsProvider>
    </AuthProvider>
  </React.StrictMode>,
);
