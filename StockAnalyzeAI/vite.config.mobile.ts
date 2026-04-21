/**
 * vite.config.mobile.ts
 *
 * Builds a single self-contained index.html for use inside
 * the Expo/React Native WebView (T-Stock-app).
 *
 * All JS + CSS are inlined into the HTML — no external asset references —
 * so the WebView can load it from the local filesystem without CORS issues.
 *
 * Usage:
 *   npx vite build --config vite.config.mobile.ts
 *   # → outputs to dist-mobile/index.html (~4 MB, gzip ~1.5 MB)
 */
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');

  return {
    base: './',
    root: '.',
    publicDir: 'public',
    plugins: [
      react(),
      tailwindcss(),
      // Inline all assets into the HTML so WebView can load a single file
      inlinePlugin(),
    ],
    define: {
      'process.env.VITE_OPENROUTER_API_KEY': JSON.stringify(env.VITE_OPENROUTER_API_KEY ?? ''),
    },
    resolve: {
      alias: { '@': path.resolve(__dirname, '.') },
    },
    build: {
      outDir: 'dist-mobile',
      emptyOutDir: true,
      target: 'es2020',
      // Single chunk — easier for WebView local file loading
      rollupOptions: {
        input: path.resolve(__dirname, 'index.html'),
        external: ['electron'],
        output: {
          inlineDynamicImports: true,
          // No code splitting — everything in one bundle
          manualChunks: undefined,
        },
      },
      // Increase limit since we're intentionally building a large single file
      chunkSizeWarningLimit: 10_000,
      assetsInlineLimit: 100_000_000, // Inline all assets (images, fonts)
    },
  };
});

/**
 * Simple Vite plugin that inlines the emitted JS + CSS into the HTML.
 * Works alongside rollup's single-entry output.
 */
function inlinePlugin() {
  return {
    name: 'inline-assets',
    enforce: 'post' as const,
    transformIndexHtml: {
      order: 'post' as const,
      handler(html: string, ctx: { bundle?: Record<string, { type: string; source?: string; code?: string }> }) {
        if (!ctx.bundle) return html;

        let result = html;

        for (const [fileName, chunk] of Object.entries(ctx.bundle)) {
          if (chunk.type === 'chunk' && fileName.endsWith('.js')) {
            const code = (chunk as { code: string }).code;
            result = result.replace(
              new RegExp(`<script[^>]*src=["'][^"']*${escapeRe(fileName)}["'][^>]*>\\s*</script>`, 'g'),
              `<script type="module">${code}</script>`,
            );
          }
          if (chunk.type === 'asset' && fileName.endsWith('.css')) {
            const css = (chunk as { source: string }).source;
            result = result.replace(
              new RegExp(`<link[^>]*href=["'][^"']*${escapeRe(fileName)}["'][^>]*>`, 'g'),
              `<style>${css}</style>`,
            );
          }
        }

        return result;
      },
    },
  };
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
