#!/usr/bin/env node
/**
 * scripts/inline-html.mjs
 *
 * Post-process dist-mobile/index.html:
 *  - Vite with inlineDynamicImports already embeds the JS bundle inline
 *  - This script inlines the remaining external CSS <link> tag as <style>
 *
 * Result: dist-mobile/index.standalone.html — fully self-contained HTML
 * (no external file references) for Expo WebView local loading.
 */
import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const distDir = resolve(__dir, '..', 'dist-mobile');
const indexPath = join(distDir, 'index.html');

let html = readFileSync(indexPath, 'utf8');
let inlineCount = 0;

// Only match <link rel="stylesheet"> tags in the <head> section
// (avoid matching anything inside <script> content)
const headEnd = html.indexOf('</head>');
const head = html.slice(0, headEnd);
const body = html.slice(headEnd);

const inlinedHead = head.replace(
  /<link\s[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*\/?>/g,
  (match, href) => {
    const filePath = resolve(distDir, href.replace(/^\.\//, '').replace(/^\//, ''));
    try {
      const css = readFileSync(filePath, 'utf8');
      inlineCount++;
      console.log(`  ✓ Inlined CSS: ${href} (${(css.length / 1024).toFixed(1)} KB)`);
      return `<style>${css}</style>`;
    } catch {
      console.warn(`  ⚠ Could not inline ${href} — keeping reference`);
      return match;
    }
  }
);

const result = inlinedHead + body;
const outPath = join(distDir, 'index.standalone.html');
writeFileSync(outPath, result, 'utf8');

const sizeKB = Math.round(result.length / 1024);
console.log(`\n✅ dist-mobile/index.standalone.html`);
console.log(`   CSS files inlined: ${inlineCount}`);
console.log(`   Total size: ~${sizeKB} KB (~${Math.round(sizeKB / 2.5)} KB gzipped estimate)`);
