import { contextBridge as a, ipcRenderer as t } from "electron";
a.exposeInMainWorld("ipcRenderer", {
  on(...e) {
    const [n, s] = e;
    return t.on(n, (c, ...i) => s(c, ...i));
  },
  off(...e) {
    const [n, ...s] = e;
    return t.off(n, ...s);
  },
  send(...e) {
    const [n, ...s] = e;
    return t.send(n, ...s);
  },
  invoke(...e) {
    const [n, ...s] = e;
    return t.invoke(n, ...s);
  }
});
a.exposeInMainWorld("api", {
  isElectron: !0,
  // Window controls
  minimize: () => t.send("window-minimize"),
  maximize: () => t.send("window-maximize"),
  close: () => t.send("window-close"),
  // Native features
  showNotification: (e, n) => t.send("show-notification", { title: e, body: n }),
  // Backend API stubs (these should be replaced or mapped to real local server calls if needed in pure offline mode)
  // Currently, the React app uses fetch() for most of these when window.api is missing, 
  // but if it uses window.api, we provide the methods here.
  getQuote: async (e) => {
  },
  getHistory: async (e, n) => {
  },
  getBatch: async (e) => {
  },
  getNews: async (e) => {
  },
  getCalendar: async (e) => {
  },
  getForex: async (e) => {
  },
  getTWSE: async (e) => {
  },
  getMTF: async (e, n) => {
  },
  runBacktest: async (e) => {
  },
  getWatchlist: async () => {
  },
  setWatchlist: async (e) => {
  },
  getPositions: async () => {
  },
  setPositions: async (e) => {
  },
  getTrades: async () => {
  },
  addTrade: async (e) => {
  },
  getAlerts: async () => {
  },
  addAlert: async (e) => {
  },
  deleteAlert: async (e) => {
  },
  triggerAlert: async (e) => {
  },
  getSetting: async (e) => {
  },
  setSetting: async (e, n) => {
  },
  getDbStats: async () => {
  },
  getSystemStats: async () => {
  },
  runScreener: async (e, n) => {
  },
  openExternal: async (e) => {
    const { shell: n } = require("electron");
    n.openExternal(e);
  },
  getVersion: async () => "1.0.0",
  getDataPath: async () => "electron-data"
});
