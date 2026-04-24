import { ipcRenderer, contextBridge } from 'electron';

// --------- Expose some API to the Renderer process ---------
contextBridge.exposeInMainWorld('ipcRenderer', {
  on(...args: Parameters<typeof ipcRenderer.on>) {
    const [channel, listener] = args;
    return ipcRenderer.on(channel, (event, ...args) => listener(event, ...args));
  },
  off(...args: Parameters<typeof ipcRenderer.off>) {
    const [channel, ...omit] = args;
    return ipcRenderer.off(channel, ...omit);
  },
  send(...args: Parameters<typeof ipcRenderer.send>) {
    const [channel, ...omit] = args;
    return ipcRenderer.send(channel, ...omit);
  },
  invoke(...args: Parameters<typeof ipcRenderer.invoke>) {
    const [channel, ...omit] = args;
    return ipcRenderer.invoke(channel, ...omit);
  },
});

contextBridge.exposeInMainWorld('api', {
  isElectron: true,
  // Window controls
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
  
  // Native features
  showNotification: (title: string, body: string) => ipcRenderer.send('show-notification', { title, body }),
  
  // Backend API stubs (these should be replaced or mapped to real local server calls if needed in pure offline mode)
  // Currently, the React app uses fetch() for most of these when window.api is missing, 
  // but if it uses window.api, we provide the methods here.
  getQuote: async (sym: string) => { /* Implement IPC to local server or proxy */ },
  getHistory: async (sym: string, opts?: any) => { /* Implement IPC */ },
  getBatch: async (syms: string[]) => { /* Implement IPC */ },
  getNews: async (sym: string) => { /* Implement IPC */ },
  getCalendar: async (sym: string) => { /* Implement IPC */ },
  getForex: async (pair?: string) => { /* Implement IPC */ },
  getTWSE: async (stockNo: string) => { /* Implement IPC */ },
  getMTF: async (sym: string, opts?: any) => { /* Implement IPC */ },
  runBacktest: async (p: any) => { /* Implement IPC */ },
  getWatchlist: async () => { /* Implement IPC */ },
  setWatchlist: async (l: any) => { /* Implement IPC */ },
  getPositions: async () => { /* Implement IPC */ },
  setPositions: async (l: any) => { /* Implement IPC */ },
  getTrades: async () => { /* Implement IPC */ },
  addTrade: async (t: any) => { /* Implement IPC */ },
  getAlerts: async () => { /* Implement IPC */ },
  addAlert: async (a: any) => { /* Implement IPC */ },
  deleteAlert: async (id: number) => { /* Implement IPC */ },
  triggerAlert: async (id: number) => { /* Implement IPC */ },
  getSetting: async (key: string) => { /* Implement IPC */ },
  setSetting: async (key: string, val: any) => { /* Implement IPC */ },
  getDbStats: async () => { /* Implement IPC */ },
  getSystemStats: async () => { /* Implement IPC */ },
  runScreener: async (symbols: string[], filters?: any) => { /* Implement IPC */ },
  openExternal: async (url: string) => { 
    // Usually uses shell.openExternal
    const { shell } = require('electron');
    shell.openExternal(url);
  },
  getVersion: async () => '1.0.0',
  getDataPath: async () => 'electron-data',
});
