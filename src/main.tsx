import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import App from './App';
import { AuthProvider } from './contexts/AuthContext';
import { SettingsProvider } from './contexts/SettingsContext';
import { ToastProvider } from './contexts/ToastContext';
import { SubscriptionProvider } from './contexts/SubscriptionContext';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import './styles.css';

// Electron production loads via file:// — BrowserRouter's history API doesn't work there.
const Router = window.location.protocol === 'file:' ? HashRouter : BrowserRouter;

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Missing #root element');

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <Router>
      <HelmetProvider>
        <AuthProvider>
          <QueryClientProvider client={queryClient}>
            <SettingsProvider>
              <SubscriptionProvider>
                <ToastProvider>
                  <App />
                </ToastProvider>
              </SubscriptionProvider>
            </SettingsProvider>
          </QueryClientProvider>
        </AuthProvider>
      </HelmetProvider>
    </Router>
  </React.StrictMode>,
);
