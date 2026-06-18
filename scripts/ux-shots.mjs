import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const OUT = '/tmp/ux-shots';
mkdirSync(OUT, { recursive: true });
const BASE = 'http://127.0.0.1:3000';

const VIEWS = [
  'dashboard', 'market', 'crypto', 'portfolio', 'research',
  'smartmoney', 'backtest', 'news', 'alerts', 'screener',
  'autotrading', 'settings',
];

const FAKE_USER = { id: 'u_demo', email: 'tommy771004@gmail.com', name: 'Tommy', tier: 'pro' };

// Generic permissive API mock: arrays are most common in this app.
async function installMocks(context, { authed }) {
  await context.route('**/api/**', async (route) => {
    const url = route.request().url();
    if (url.includes('/api/auth/me')) {
      if (authed) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FAKE_USER) });
      return route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: 'unauthorized' }) });
    }
    if (url.includes('/api/auth/login')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user: FAKE_USER }) });
    }
    // Default: empty list (tolerant of .map / .length); pages with object shapes fall to empty/error states.
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
}

const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 390, height: 844 };

async function shoot(browser, { authed, view, label, viewport }) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  await installMocks(context, { authed });
  const page = await context.newPage();
  page.on('console', (m) => { if (m.type() === 'error') console.log(`  [console.error ${view}] ${m.text().slice(0, 140)}`); });
  const path = authed ? `${BASE}/${view}` : `${BASE}/login`;
  try {
    await page.goto(path, { waitUntil: 'domcontentloaded', timeout: 20000 });
  } catch (e) {
    console.log(`  goto warn ${label}: ${String(e).slice(0, 100)}`);
  }
  await page.waitForTimeout(2600);
  const file = `${OUT}/${label}.png`;
  await page.screenshot({ path: file, fullPage: true });
  console.log(`  saved ${file}`);
  await context.close();
}

const browser = await chromium.launch();

// 1) Login page (unauthenticated) — desktop + mobile
console.log('LOGIN');
await shoot(browser, { authed: false, view: 'login', label: '00-login-desktop', viewport: DESKTOP });
await shoot(browser, { authed: false, view: 'login', label: '00-login-mobile', viewport: MOBILE });

// 2) Authenticated views — desktop + mobile
let i = 1;
for (const view of VIEWS) {
  const n = String(i).padStart(2, '0');
  console.log(`VIEW ${view}`);
  await shoot(browser, { authed: true, view, label: `${n}-${view}-desktop`, viewport: DESKTOP });
  await shoot(browser, { authed: true, view, label: `${n}-${view}-mobile`, viewport: MOBILE });
  i++;
}

await browser.close();
console.log('DONE');
