/**
 * Generates public/og-image.png (1200×630) from an inline SVG template.
 * Run: node scripts/generate-og.mjs
 */
import { Resvg } from '@resvg/resvg-js';
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '../public/og-image.png');

const W = 1200;
const H = 630;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0a0d13"/>
      <stop offset="100%" stop-color="#0f1420"/>
    </linearGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#818cf8" stop-opacity="0.9"/>
      <stop offset="100%" stop-color="#34d399" stop-opacity="0.9"/>
    </linearGradient>
    <linearGradient id="chartLine" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#818cf8" stop-opacity="0.3"/>
      <stop offset="60%" stop-color="#818cf8" stop-opacity="0.9"/>
      <stop offset="100%" stop-color="#34d399" stop-opacity="0.9"/>
    </linearGradient>
    <filter id="glow">
      <feGaussianBlur stdDeviation="3" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>

  <!-- Background -->
  <rect width="${W}" height="${H}" fill="url(#bg)"/>

  <!-- Subtle grid -->
  ${Array.from({ length: 13 }, (_, i) => `<line x1="${i * 100}" y1="0" x2="${i * 100}" y2="${H}" stroke="rgba(255,255,255,0.03)" stroke-width="1"/>`).join('')}
  ${Array.from({ length: 7 }, (_, i) => `<line x1="0" y1="${i * 105}" x2="${W}" y2="${i * 105}" stroke="rgba(255,255,255,0.03)" stroke-width="1"/>`).join('')}

  <!-- Top accent bar -->
  <rect x="0" y="0" width="${W}" height="3" fill="url(#accent)"/>

  <!-- Decorative chart (right side) -->
  <!-- Chart area background -->
  <rect x="660" y="90" width="480" height="380" rx="16" fill="rgba(129,140,248,0.04)" stroke="rgba(129,140,248,0.12)" stroke-width="1"/>

  <!-- Chart grid lines inside chart -->
  ${[1,2,3,4].map(i => `<line x1="680" y1="${90 + i*76}" x2="1120" y2="${90 + i*76}" stroke="rgba(255,255,255,0.04)" stroke-width="1"/>`).join('')}

  <!-- Simulated equity curve -->
  <polyline
    points="680,420 730,400 780,380 820,370 860,340 890,350 920,300 960,280 1000,260 1040,230 1080,200 1120,175"
    fill="none"
    stroke="url(#chartLine)"
    stroke-width="2.5"
    stroke-linecap="round"
    stroke-linejoin="round"
    filter="url(#glow)"
  />

  <!-- Endpoint dot -->
  <circle cx="1120" cy="175" r="5" fill="#34d399" filter="url(#glow)"/>
  <circle cx="1120" cy="175" r="10" fill="rgba(52,211,153,0.2)"/>

  <!-- Benchmark line (dashed) -->
  <polyline
    points="680,420 730,415 780,400 820,405 860,395 890,400 920,385 960,375 1000,365 1040,355 1080,345 1120,335"
    fill="none"
    stroke="rgba(255,255,255,0.12)"
    stroke-width="1.5"
    stroke-dasharray="6 4"
    stroke-linecap="round"
  />

  <!-- Chart labels -->
  <text x="690" y="476" font-family="monospace" font-size="11" fill="rgba(255,255,255,0.3)" font-weight="bold">STRATEGY</text>
  <text x="1050" y="476" font-family="monospace" font-size="11" fill="rgba(255,255,255,0.2)">BENCHMARK</text>

  <!-- Left content area -->
  <!-- Brand badge -->
  <rect x="60" y="80" width="52" height="52" rx="14" fill="rgba(129,140,248,0.15)" stroke="rgba(129,140,248,0.3)" stroke-width="1"/>
  <!-- H letter -->
  <text x="80" y="115" font-family="monospace" font-size="26" font-weight="bold" fill="#818cf8">H</text>

  <!-- Main title -->
  <text x="60" y="200" font-family="Arial, sans-serif" font-size="52" font-weight="bold" fill="white" letter-spacing="-1">Hermes AI Trading</text>

  <!-- Tagline -->
  <text x="62" y="255" font-family="Arial, sans-serif" font-size="24" fill="rgba(255,255,255,0.55)" letter-spacing="0.5">量化交易平台・AI 股票分析</text>

  <!-- Accent line under title -->
  <rect x="60" y="272" width="200" height="2" rx="1" fill="url(#accent)"/>

  <!-- Feature pills -->
  ${[
    { x: 60,  label: '策略回測' },
    { x: 168, label: 'AI 訊號' },
    { x: 258, label: '自動交易' },
    { x: 370, label: '即時報價' },
  ].map(({ x, label }) => `
    <rect x="${x}" y="300" width="${label.length * 14 + 20}" height="30" rx="8" fill="rgba(129,140,248,0.1)" stroke="rgba(129,140,248,0.25)" stroke-width="1"/>
    <text x="${x + 10}" y="320" font-family="Arial, sans-serif" font-size="13" fill="rgba(255,255,255,0.7)">${label}</text>
  `).join('')}

  <!-- Stats row -->
  ${[
    { x: 60,  val: '4+',   label: 'Strategies' },
    { x: 170, val: 'AI',   label: 'Multi-Signal' },
    { x: 280, val: 'Live', label: 'Real-time' },
  ].map(({ x, val, label }) => `
    <text x="${x}" y="420" font-family="Arial, sans-serif" font-size="32" font-weight="bold" fill="white">${val}</text>
    <text x="${x}" y="443" font-family="Arial, sans-serif" font-size="13" fill="rgba(255,255,255,0.35)">${label}</text>
  `).join('')}

  <!-- URL footer -->
  <text x="60" y="580" font-family="monospace" font-size="15" fill="rgba(255,255,255,0.3)" letter-spacing="1">hermes-ai.trading</text>

  <!-- Bottom accent -->
  <rect x="0" y="${H - 2}" width="${W}" height="2" fill="url(#accent)" opacity="0.5"/>
</svg>`;

const resvg = new Resvg(svg, {
  fitTo: { mode: 'width', value: W },
});
const pngData = resvg.render();
const pngBuffer = pngData.asPng();

writeFileSync(OUT, pngBuffer);
console.log(`✓ og-image.png written to ${OUT} (${Math.round(pngBuffer.length / 1024)} KB)`);
