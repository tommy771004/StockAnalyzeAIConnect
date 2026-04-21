import React, { useState } from 'react';
import Decimal from 'decimal.js';
import { AlertTriangle, Send, ShieldCheck, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { cn } from '../lib/utils';
import * as api from '../services/api';
import { motion, AnimatePresence } from 'motion/react';

export default function LiveTradingConsole() {
  const settings = { compactMode: false };
  const compact = settings.compactMode;
  const [symbol, setSymbol] = useState('2330.TW');
  const [qty, setQty] = useState(1000);
  const [price, setPrice] = useState(680);
  const [side, setSide] = useState<'BUY' | 'SELL'>('BUY');
  const [status, setStatus] = useState<'idle' | 'executing' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [validationErr, setValidationErr] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);

  const validate = (): boolean => {
    if (!symbol.trim()) { setValidationErr('請輸入標的代碼'); return false; }
    if (!qty || qty <= 0) { setValidationErr('數量必須大於 0'); return false; }
    if (!price || price <= 0) { setValidationErr('價格必須大於 0'); return false; }
    setValidationErr('');
    return true;
  };

  const handleSubmit = () => {
    if (!validate()) return;
    setShowConfirm(true);
  };

  const executeTrade = async () => {
    setShowConfirm(false);
    setStatus('executing');
    setErrorMsg('');
    try {
      const data = await api.addTrade({ symbol: symbol.trim().toUpperCase(), side, qty, price, mode: 'real' });
      if (data.status !== 'success') throw new Error(data.message || '交易失敗');
      setStatus('success');
      setTimeout(() => setStatus('idle'), 5000);
    } catch (e: unknown) {
      setStatus('error');
      setErrorMsg(e instanceof Error ? e.message : '下單失敗');
    }
  };

  const totalCost = isFinite(qty) && isFinite(price) ? new Decimal(qty).times(price).toNumber() : 0;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5 }}
      className={cn("liquid-glass rounded-2xl flex flex-col border border-rose-500/20", compact ? "p-3 gap-2" : "p-6 gap-4")}
    >
      <h2 className={cn("font-black text-white flex items-center gap-2 uppercase tracking-widest", compact ? "text-xs" : "text-sm")}>
        <ShieldCheck className="text-rose-400" size={compact ? 16 : 20} />
        實盤交易控制台
        <span className="px-2 py-0.5 rounded-lg bg-rose-500/10 text-rose-400 text-[0.6rem] font-black border border-rose-500/20 ml-auto uppercase">LIVE</span>
      </h2>

      <div className={cn("bg-rose-500/10 border border-rose-500/20 rounded-xl flex gap-3 items-start", compact ? "p-2" : "p-4")}>
        <AlertTriangle className="text-rose-400 shrink-0 mt-0.5" size={compact ? 14 : 16} />
        <p className={cn("text-rose-200", compact ? "label-meta" : "text-xs")}>
          <strong>風險提示：</strong> 此操作將使用真實資金。請確保策略已在模擬環境充分測試。
        </p>
      </div>

      {/* Side selector */}
      <div className="flex gap-2">
        {(['BUY', 'SELL'] as const).map(s => (
          <button key={s} onClick={() => setSide(s)}
            className={cn('flex-1 py-2.5 rounded-xl text-sm font-black uppercase tracking-widest border transition-all',
              side === s
                ? s === 'BUY' ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20' : 'bg-rose-500/10 text-rose-300 border-rose-500/20'
                : 'bg-zinc-950 text-zinc-500 border-zinc-800 hover:bg-zinc-900')}>
            {s === 'BUY' ? '買入' : '賣出'}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="block text-zinc-500 mb-1.5 text-xs font-black uppercase tracking-widest">標的代碼</label>
          <input type="text" value={symbol} onChange={e => { setSymbol(e.target.value.toUpperCase()); setValidationErr(''); }}
            className={cn("w-full bg-zinc-950 border border-zinc-800 rounded-xl text-white font-mono font-bold text-base md:text-sm focus:outline-none focus:border-emerald-500/50 transition-all", compact ? "px-2 py-1.5" : "px-3 py-2.5")} />
        </div>
        <div>
          <label className="block text-zinc-500 mb-1.5 text-xs font-black uppercase tracking-widest">數量 (股)</label>
          <input type="number" min="1" value={qty} onChange={e => { setQty(Number(e.target.value)); setValidationErr(''); }}
            className={cn("w-full bg-zinc-950 border border-zinc-800 rounded-xl text-white font-mono font-bold text-base md:text-sm focus:outline-none focus:border-emerald-500/50 transition-all", compact ? "px-2 py-1.5" : "px-3 py-2.5")} />
        </div>
        <div>
          <label className="block text-zinc-500 mb-1.5 text-xs font-black uppercase tracking-widest">價格</label>
          <input type="number" min="0.01" step="0.01" value={price} onChange={e => { setPrice(Number(e.target.value)); setValidationErr(''); }}
            className={cn("w-full bg-zinc-950 border border-zinc-800 rounded-xl text-white font-mono font-bold text-base md:text-sm focus:outline-none focus:border-emerald-500/50 transition-all", compact ? "px-2 py-1.5" : "px-3 py-2.5")} />
        </div>
      </div>

      {/* Order preview */}
      <div className="flex items-center justify-between bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5">
        <span className="text-xs text-zinc-500 font-bold uppercase tracking-widest">預估金額</span>
        <span className={cn("text-sm font-black font-mono", side === 'BUY' ? 'text-emerald-400' : 'text-rose-400')}>
          {side === 'BUY' ? '買' : '賣'} {symbol} × {qty.toLocaleString()} = ${totalCost.toLocaleString()}
        </span>
      </div>

      <AnimatePresence>
        {validationErr && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
            className="flex items-center gap-2 text-amber-400 text-xs font-bold bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2">
            <AlertTriangle size={12}/> {validationErr}
          </motion.div>
        )}
      </AnimatePresence>

      <button
        onClick={handleSubmit}
        disabled={status === 'executing'}
        className={cn("w-full font-black rounded-xl flex items-center justify-center gap-2 transition-all disabled:opacity-50 uppercase tracking-widest border",
          side === 'BUY'
            ? 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-500/30'
            : 'bg-rose-600 hover:bg-rose-500 text-white border-rose-500/30',
          compact ? "py-2 text-xs" : "py-3 text-sm")}
      >
        {status === 'executing' ? <Loader2 size={16} className="animate-spin"/> : <Send size={compact ? 14 : 16} />}
        {status === 'executing' ? '執行中...' : side === 'BUY' ? '執行買入' : '執行賣出'}
      </button>

      {/* Confirmation modal */}
      <AnimatePresence>
        {showConfirm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="liquid-glass-strong p-6 rounded-2xl max-w-sm w-full border border-rose-500/20 shadow-2xl">
              <div className="flex items-center gap-2 mb-4">
                <AlertTriangle className="text-rose-400" size={20}/>
                <h3 className="text-white font-black uppercase tracking-widest text-sm">確認執行交易</h3>
              </div>
              <div className="bg-zinc-950 rounded-xl p-4 mb-4 border border-zinc-800">
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="text-zinc-500">標的</div><div className="text-white font-bold font-mono">{symbol}</div>
                  <div className="text-zinc-500">方向</div><div className={cn("font-bold", side === 'BUY' ? 'text-emerald-400' : 'text-rose-400')}>{side === 'BUY' ? '買入' : '賣出'}</div>
                  <div className="text-zinc-500">數量</div><div className="text-white font-bold font-mono">{qty.toLocaleString()} 股</div>
                  <div className="text-zinc-500">價格</div><div className="text-white font-bold font-mono">${price.toLocaleString()}</div>
                  <div className="text-zinc-500">總額</div><div className="text-white font-black font-mono">${totalCost.toLocaleString()}</div>
                </div>
              </div>
              <p className="text-xs text-rose-300 mb-5 font-bold">此操作將使用真實資金，確認後無法撤銷。</p>
              <div className="flex gap-3">
                <button onClick={() => setShowConfirm(false)} className="flex-1 bg-zinc-900 text-zinc-400 py-2.5 rounded-xl hover:bg-zinc-800 transition-colors font-black text-xs uppercase tracking-widest border border-zinc-800">取消</button>
                <button onClick={executeTrade} className="flex-1 bg-rose-600 text-white py-2.5 rounded-xl hover:bg-rose-500 transition-colors font-black text-xs uppercase tracking-widest border border-rose-500/30">確認執行</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Status feedback */}
      <AnimatePresence>
        {status === 'error' && (
          <motion.div initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="flex items-center gap-2 text-rose-400 text-xs font-bold bg-rose-500/10 border border-rose-500/20 rounded-xl px-3 py-2.5">
            <XCircle size={14}/> {errorMsg}
          </motion.div>
        )}
        {status === 'success' && (
          <motion.div initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="flex items-center gap-2 text-emerald-400 text-xs font-bold bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-3 py-2.5">
            <CheckCircle size={14}/> 交易執行成功！
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}