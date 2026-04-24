/**
 * src/components/CheckoutButton.tsx
 *
 * ECPay Checkout 按鈕
 *
 * 當使用者選擇付費方案時，呼叫後端 /api/payment/ecpay/checkout，
 * 後端回傳一個 HTML 表單頁面（autosubmit），直接 POST 到綠界的付款頁。
 *
 * Usage:
 *   <CheckoutButton planId="pro_monthly" label="升級至 Pro — $799/月" />
 *   <CheckoutButton planId="basic_annual" label="年付省 20%" variant="amber" />
 */

import React, { useState } from 'react';
import { cn } from '../lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

type PlanId = 'basic_monthly' | 'basic_annual' | 'pro_monthly' | 'pro_annual';

type Variant = 'sky' | 'amber' | 'zinc';

interface CheckoutButtonProps {
  planId:   PlanId;
  label?:   string;
  variant?: Variant;
  className?: string;
  /** Full-width button */
  block?: boolean;
}

// ─── Variant Styles ───────────────────────────────────────────────────────────

const VARIANT_STYLES: Record<Variant, string> = {
  sky:   'bg-sky-500 hover:bg-sky-400 text-white shadow-sky-500/25',
  amber: 'bg-amber-400 hover:bg-amber-300 text-amber-950 shadow-amber-400/25',
  zinc:  'bg-white/10 hover:bg-white/15 text-white border border-white/10',
};

// ─── Component ────────────────────────────────────────────────────────────────

export function CheckoutButton({
  planId,
  label,
  variant = 'sky',
  className,
  block = true,
}: CheckoutButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClick = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/payment/ecpay/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId }),
      });

      if (res.status === 401) {
        setError('請先登入後再進行付款');
        return;
      }

      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        setError(body?.error ?? '付款初始化失敗，請稍後再試');
        return;
      }

      // Backend returns HTML that auto-posts to ECPay.
      // Inject it into a hidden iframe or open in a new window.
      const html = await res.text();

      // Open ECPay form in the same tab (standard checkout flow)
      const blob = new Blob([html], { type: 'text/html' });
      const url  = URL.createObjectURL(blob);
      window.location.href = url;
      // URL.revokeObjectURL is not needed — page will navigate away

    } catch {
      setError('網路錯誤，請檢查連線後再試');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={block ? 'w-full' : undefined}>
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className={cn(
          'flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all shadow-lg active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed',
          block && 'w-full',
          VARIANT_STYLES[variant],
          className,
        )}
      >
        {loading ? (
          <>
            <span className="size-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
            跳轉至綠界付款...
          </>
        ) : (
          label ?? '立即付款'
        )}
      </button>

      {/* Inline error — shown next to button */}
      {error && (
        <p role="alert" className="mt-2 text-[12px] text-rose-400 text-center">
          {error}
        </p>
      )}

      {/* Trust signals */}
      <p className="mt-2 text-[10px] text-zinc-600 text-center flex items-center justify-center gap-1">
        <span>🔒</span> 由綠界科技 ECPay 安全加密處理
      </p>
    </div>
  );
}

// ─── Convenience Pre-configured Buttons ───────────────────────────────────────

export function BasicMonthlyButton() {
  return <CheckoutButton planId="basic_monthly" label="訂閱簡易模型 — NT$6,368/月" variant="amber" />;
}

export function BasicAnnualButton() {
  return <CheckoutButton planId="basic_annual" label="年付簡易模型 — NT$60,960/年（省20%）" variant="amber" />;
}

export function ProMonthlyButton() {
  return <CheckoutButton planId="pro_monthly" label="訂閱 Pro — NT$25,568/月" variant="sky" />;
}

export function ProAnnualButton() {
  return <CheckoutButton planId="pro_annual" label="年付 Pro — NT$245,376/年（省20%）" variant="sky" />;
}
