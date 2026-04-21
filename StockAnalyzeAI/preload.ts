import { contextBridge, ipcRenderer } from 'electron';

const inv = (ch: string, ...a: any[]) => ipcRenderer.invoke(ch, ...a);

contextBridge.exposeInMainWorld('api', {
  isElectron: true as const,

  // Stock / market
  getQuote:    (sym: string)               => inv('stock:quote',    sym),
  getHistory:  (sym: string, o?: any)      => inv('stock:history',  sym, o ?? {}),
  getBatch:    (syms: string[])            => inv('stock:batch',    syms),
  getNews:     (sym: string)               => inv('stock:news',     sym),
  getCalendar: (sym: string)               => inv('stock:calendar', sym),
  getForex:    (pair?: string)             => inv('forex:rate',     pair ?? 'USDTWD=X'),
  getTWSE:     (stockNo: string)           => inv('twse:stock',     stockNo),
  runBacktest: (p: any)                    => inv('backtest:run',   p),

  // Watchlist
  getWatchlist:  ()            => inv('watchlist:get'),
  setWatchlist:  (l: any[])   => inv('watchlist:set', l),

  // Positions
  getPositions:  ()            => inv('positions:get'),
  setPositions:  (l: any[])   => inv('positions:set', l),

  // Trades
  getTrades:     ()                      => inv('trades:get'),
  addTrade:      (t: any)               => inv('trades:add',    t),
  updateTrade:   (t: any)               => inv('trades:update', t),
  deleteTrade:   (id: number)           => inv('trades:delete', id),

  // Price Alerts
  getAlerts:     ()                      => inv('alerts:list'),
  addAlert:      (a: any)               => inv('alerts:add',     a),
  deleteAlert:   (id: number)           => inv('alerts:delete',  id),
  triggerAlert:  (id: number)           => inv('alerts:trigger', id),

  // App Settings (persistent)
  getSetting:    (key: string)          => inv('settings:get', key),
  setSetting:    (key: string, val: any)=> inv('settings:set', key, val),

  // DB info
  getDbStats:    ()                      => inv('db:stats'),

  // System
  openExternal: (url: string)           => inv('shell:open',    url),
  getVersion:   ()                       => inv('app:version'),
  getDataPath:  ()                       => inv('app:dataPath'),
});