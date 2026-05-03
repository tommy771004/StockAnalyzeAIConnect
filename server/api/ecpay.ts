/**
 * server/api/ecpay.ts
 *
 * 綠界 ECPay 訂閱金流整合
 *
 * 流程：
 *   1. POST /api/payment/ecpay/checkout
 *      → 建立訂單，產生 ECPay 表單 HTML，前端直接 POST 到綠界
 *   2. POST /api/payment/ecpay/notify  (無需 auth — 由綠界伺服器呼叫)
 *      → 驗證 CheckMacValue，更新 DB 中的 subscriptionTier
 *   3. GET  /api/payment/ecpay/return  (使用者付款後導回)
 *      → 驗證並顯示成功/失敗頁面
 *
 * 環境變數（.env）：
 *   ECPAY_MERCHANT_ID   = 測試: 2000132
 *   ECPAY_HASH_KEY      = 測試: 5294y06JbISpM5x9
 *   ECPAY_HASH_IV       = 測試: v77hoKGq4kWxNNIS
 *   ECPAY_ENV           = sandbox | production
 *   APP_BASE_URL        = https://your-domain.com  (用於 callback URL)
 *
 * 参考文件：https://developers.ecpay.com.tw/
 */

import { Router, type Response } from 'express';
import crypto from 'crypto';
import { db } from '../../src/db/index.js';
import { paymentOrders } from '../../src/db/schema.js';
import { eq } from 'drizzle-orm';
import * as usersRepo from '../repositories/usersRepo.js';
import type { AuthRequest } from '../middleware/auth.js';

export const ecpayRouter = Router();

// ─── Config ───────────────────────────────────────────────────────────────────

const ECPAY_MERCHANT_ID = (process.env.ECPAY_MERCHANT_ID ?? '').trim();
const ECPAY_HASH_KEY    = (process.env.ECPAY_HASH_KEY ?? '').trim();
const ECPAY_HASH_IV     = (process.env.ECPAY_HASH_IV ?? '').trim();
const IS_SANDBOX        = (process.env.ECPAY_ENV ?? 'sandbox') !== 'production';
const APP_BASE_URL      = (process.env.APP_BASE_URL ?? '').replace(/\/$/, '');

const MISSING_ECPAY_VARS = [
  !ECPAY_MERCHANT_ID ? 'ECPAY_MERCHANT_ID' : null,
  !ECPAY_HASH_KEY ? 'ECPAY_HASH_KEY' : null,
  !ECPAY_HASH_IV ? 'ECPAY_HASH_IV' : null,
].filter(Boolean) as string[];

const ECPAY_CONFIG_OK = MISSING_ECPAY_VARS.length === 0;
if (!ECPAY_CONFIG_OK) {
  console.warn(`[ECPay] Missing required env vars: ${MISSING_ECPAY_VARS.join(', ')}`);
}

function ensureEcpayConfigured(res: Response, mode: 'json' | 'notify' | 'html' = 'json') {
  if (ECPAY_CONFIG_OK) return true;
  const message = `ECPay configuration missing: ${MISSING_ECPAY_VARS.join(', ')}`;
  if (mode === 'notify') {
    res.status(500).send('0|ErrorMessage');
    return false;
  }
  if (mode === 'html') {
    res.status(500).send(`<!DOCTYPE html>
<html lang="zh-TW"><head><meta charset="UTF-8"><title>付款服務暫停</title></head>
<body style="font-family:sans-serif;text-align:center;padding:60px">
  <h2 style="color:#ef4444">付款服務暫停</h2>
  <p>系統設定尚未完成，請稍後再試或聯繫客服。</p>
  <p style="color:#6b7280;font-size:12px">${message}</p>
  <a href="/" style="color:#3b82f6">返回首頁</a>
</body></html>`);
    return false;
  }
  res.status(500).json({ error: message });
  return false;
}

function resolveAppBaseUrl(req: AuthRequest): string {
  if (APP_BASE_URL) return APP_BASE_URL;
  const forwardedProto = req.get('x-forwarded-proto')?.split(',')[0]?.trim();
  const proto = forwardedProto || req.protocol || 'https';
  const host = req.get('x-forwarded-host') || req.get('host');
  return host ? `${proto}://${host}` : 'http://localhost:3000';
}

const ECPAY_ENDPOINT = IS_SANDBOX
  ? 'https://payment-stage.ecpay.com.tw/Cashier/AioCheckout/V5'
  : 'https://payment.ecpay.com.tw/Cashier/AioCheckout/V5';

// ─── Plan Definitions ─────────────────────────────────────────────────────────

interface PlanDefinition {
  tier:        'basic' | 'pro';
  nameTw:      string;
  priceNtd:    number; // NTD
  billingCycle: 'monthly' | 'annual';
}

const PLANS: Record<string, PlanDefinition> = {
  basic_monthly:  { tier: 'basic', nameTw: '簡易模型 - 月付',   priceNtd: 199 * 32, billingCycle: 'monthly' },
  basic_annual:   { tier: 'basic', nameTw: '簡易模型 - 年付',   priceNtd: 159 * 12 * 32, billingCycle: 'annual' },
  pro_monthly:    { tier: 'pro',   nameTw: '深入分析模型 - 月付', priceNtd: 799 * 32, billingCycle: 'monthly' },
  pro_annual:     { tier: 'pro',   nameTw: '深入分析模型 - 年付', priceNtd: 639 * 12 * 32, billingCycle: 'annual' },
};

// ─── ECPay Signature ──────────────────────────────────────────────────────────

/**
 * ECPay CheckMacValue 計算
 * Spec: URL-encode → alphabetical sort → prepend HashKey → append HashIV → SHA256 → uppercase
 */
function computeCheckMacValue(params: Record<string, string>): string {
  const sorted = Object.entries(params)
    .filter(([k]) => k !== 'CheckMacValue')
    .sort(([a], [b]) => a.toLowerCase().localeCompare(b.toLowerCase()));

  const raw = `HashKey=${ECPAY_HASH_KEY}&${sorted.map(([k, v]) => `${k}=${v}`).join('&')}&HashIV=${ECPAY_HASH_IV}`;

  // ECPay URL-encoding rules (slightly different from standard encodeURIComponent)
  const encoded = encodeURIComponent(raw)
    .toLowerCase()
    .replace(/%20/g, '+')
    .replace(/%21/g, '!')
    .replace(/%28/g, '(')
    .replace(/%29/g, ')')
    .replace(/%2a/g, '*');

  return crypto.createHash('sha256').update(encoded).digest('hex').toUpperCase();
}

function verifyCheckMacValue(params: Record<string, string>): boolean {
  const received = params['CheckMacValue'];
  if (!received) return false;
  const expected = computeCheckMacValue(params);
  return crypto.timingSafeEqual(
    Buffer.from(received.toUpperCase()),
    Buffer.from(expected.toUpperCase()),
  );
}

// ─── Build Form HTML ──────────────────────────────────────────────────────────

function buildAutoPostForm(endpoint: string, params: Record<string, string>): string {
  const fields = Object.entries(params)
    .map(([k, v]) => `<input type="hidden" name="${k}" value="${v}">`)
    .join('\n');

  return `<!DOCTYPE html>
<html lang="zh-TW">
<head><meta charset="UTF-8"><title>付款轉跳中...</title></head>
<body>
  <p style="font-family:sans-serif;text-align:center;padding:40px">正在跳轉至綠界付款頁面，請稍候...</p>
  <form id="ecpay_form" method="POST" action="${endpoint}">
    ${fields}
  </form>
  <script>document.getElementById('ecpay_form').submit();</script>
</body>
</html>`;
}

// ─── POST /api/payment/ecpay/checkout ────────────────────────────────────────

ecpayRouter.post('/checkout', async (req: AuthRequest, res) => {
  if (!ensureEcpayConfigured(res)) return;
  const userId = req.userId;
  if (!userId) { res.status(401).json({ error: '未授權' }); return; }

  const { planId } = req.body as { planId?: string };
  const plan = planId ? PLANS[planId] : undefined;

  if (!plan) {
    res.status(400).json({
      error: '無效的方案代號',
      validPlans: Object.keys(PLANS),
    });
    return;
  }

  // Merchant trade number: unique per transaction (max 20 chars)
  const tradeNo = `Q${Date.now()}${userId.slice(0, 4)}`.slice(0, 20);

  // Persist order to DB for reliable lookup on notify
  await db.insert(paymentOrders).values({
    merchantTradeNo: tradeNo,
    userId,
    planId: planId!,
    amount: String(plan.priceNtd),
    status: 'pending',
  });

  const tradeDate = new Date()
    .toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false })
    .replace(/\//g, '/')         // ECPay format: 2024/01/15 14:30:00
    .replace(',', '');

  const appBaseUrl = resolveAppBaseUrl(req);
  const params: Record<string, string> = {
    MerchantID:        ECPAY_MERCHANT_ID,
    MerchantTradeNo:   tradeNo,
    MerchantTradeDate: tradeDate,
    PaymentType:       'aio',
    TotalAmount:       String(plan.priceNtd),
    TradeDesc:         encodeURIComponent(`Quantum AI ${plan.nameTw}`),
    ItemName:          plan.nameTw,
    ReturnURL:         `${appBaseUrl}/api/payment/ecpay/notify`,
    OrderResultURL:    `${appBaseUrl}/api/payment/ecpay/return`,
    ChoosePayment:     'Credit',
    EncryptType:       '1',
  };

  params['CheckMacValue'] = computeCheckMacValue(params);

  console.log(`[ECPay] Creating checkout tradeNo=${tradeNo} plan=${planId} user=${userId}`);
  res.send(buildAutoPostForm(ECPAY_ENDPOINT, params));
});

// ─── POST /api/payment/ecpay/notify  (Server-to-server by ECPay) ─────────────

ecpayRouter.post('/notify', async (req, res) => {
  if (!ensureEcpayConfigured(res, 'notify')) return;
  const params = req.body as Record<string, string>;

  // 1. Verify signature
  if (!verifyCheckMacValue(params)) {
    console.error('[ECPay] notify: invalid CheckMacValue', params);
    res.send('0|ErrorMessage'); // ECPay expects "0|..." on failure
    return;
  }

  const { MerchantTradeNo, RtnCode, RtnMsg } = params;
  console.log(`[ECPay] notify tradeNo=${MerchantTradeNo} rtnCode=${RtnCode} msg=${RtnMsg}`);

  // RtnCode === '1' means success
  if (RtnCode !== '1') {
    console.warn(`[ECPay] Payment not successful: ${RtnCode} ${RtnMsg}`);
    res.send('1|OK'); // Acknowledge receipt even on failure
    return;
  }

  // 2. Look up pending trade in DB
  const trades = await db.select().from(paymentOrders).where(eq(paymentOrders.merchantTradeNo, MerchantTradeNo));
  const trade = trades[0];
  if (!trade) {
    console.error(`[ECPay] No pending trade for ${MerchantTradeNo}`);
    res.send('1|OK');
    return;
  }
  
  if (trade.status === 'success') {
    res.send('1|OK'); // Already processed
    return;
  }

  const plan = PLANS[trade.planId];
  if (!plan) {
    console.error(`[ECPay] Unknown planId ${trade.planId}`);
    res.send('1|OK');
    return;
  }

  // 3. Upgrade user tier in DB and mark order as success
  try {
    await usersRepo.updateUser(trade.userId, {
      subscriptionTier: plan.tier,
      updatedAt: new Date(),
    });
    
    await db.update(paymentOrders)
      .set({ status: 'success', updatedAt: new Date() })
      .where(eq(paymentOrders.merchantTradeNo, MerchantTradeNo));
      
    console.log(`[ECPay] ✓ User ${trade.userId} upgraded to ${plan.tier}`);
  } catch (err) {
    console.error('[ECPay] DB update failed:', (err as Error).message);
    // Don't delete trade — allow manual reconciliation
  }

  // ECPay requires exactly "1|OK" for success acknowledgement
  res.send('1|OK');
});

// ─── GET /api/payment/ecpay/return  (User return page) ───────────────────────

ecpayRouter.get('/return', async (req, res) => {
  if (!ensureEcpayConfigured(res, 'html')) return;
  const params = req.query as Record<string, string>;

  if (!verifyCheckMacValue(params)) {
    res.send(`<!DOCTYPE html>
<html lang="zh-TW"><head><meta charset="UTF-8"><title>付款驗證失敗</title></head>
<body style="font-family:sans-serif;text-align:center;padding:60px">
  <h2 style="color:#ef4444">付款驗證失敗</h2>
  <p>請聯繫客服確認您的訂單狀態。</p>
  <a href="/" style="color:#3b82f6">返回首頁</a>
</body></html>`);
    return;
  }

  const success = params['RtnCode'] === '1';

  res.send(`<!DOCTYPE html>
<html lang="zh-TW"><head><meta charset="UTF-8">
<title>${success ? '付款成功' : '付款失敗'}</title>
<meta http-equiv="refresh" content="3;url=/">
</head>
<body style="font-family:sans-serif;text-align:center;padding:60px">
  ${success
    ? `<div style="color:#22c55e;font-size:3rem;margin-bottom:16px">✓</div>
       <h2 style="color:#22c55e">付款成功！</h2>
       <p>您的方案已升級，正在返回首頁...</p>`
    : `<div style="color:#ef4444;font-size:3rem;margin-bottom:16px">✗</div>
       <h2 style="color:#ef4444">付款未完成</h2>
       <p>原因：${params['RtnMsg'] ?? '未知'}，正在返回首頁...</p>`
  }
  <a href="/" style="color:#3b82f6">立即返回</a>
</body></html>`);
});

// ─── GET /api/payment/plans  (Plan listing for frontend) ─────────────────────

ecpayRouter.get('/plans', (_req, res) => {
  res.json(
    Object.entries(PLANS).map(([id, p]) => ({
      id,
      tier:         p.tier,
      nameTw:       p.nameTw,
      priceNtd:     p.priceNtd,
      billingCycle: p.billingCycle,
    })),
  );
});
