import { VitePWA } from 'vite-plugin-pwa';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron';
import renderer from 'vite-plugin-electron-renderer';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env    = loadEnv(mode, '.', '');
  const isProd = mode === 'production';

  return {
    base:    isProd ? './' : '/',
    root:    '.',
    publicDir: 'public',
    plugins: [
      react(),
      tailwindcss(),
      // Only include Electron plugins if not building on Vercel
      ...(process.env.VERCEL ? [] : [
        electron([
          {
            entry: 'electron/main.ts',
          },
          {
            entry: 'electron/preload.ts',
            onstart(options) {
              options.reload();
            },
          },
        ]),
        renderer(),
      ]),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.svg'],
        manifest: {
          name: 'AI Stock Analysis',
          short_name: 'ASA',
          description: 'AI-Powered Commuter Trading',
          theme_color: '#10b981',
          background_color: '#000000',
          display: 'standalone',
          icons: [
            {
              src: 'favicon.svg',
              sizes: '192x192 512x512',
              type: 'image/svg+xml',
              purpose: 'any maskable'
            }
          ]
        }
      })
    ],
    define: {
      'process.env.VITE_OPENROUTER_API_KEY': JSON.stringify(env.VITE_OPENROUTER_API_KEY ?? ''),
    },
    resolve: {
      alias: { '@': path.resolve(__dirname, '.') },
    },
    optimizeDeps: {
      exclude: ['electron'],
    },
    build: {
      outDir:      'dist',
      emptyOutDir: true,
      target:      'es2022',
      chunkSizeWarningLimit: 2500,
      rollupOptions: {
        input:    path.resolve(__dirname, 'index.html'),
        external: ['electron'],
        output: {
          manualChunks: {
            'react-vendor':  ['react', 'react-dom'],
            'chart-vendor':  ['recharts', 'lightweight-charts'],
            'motion-vendor': ['motion'],
          },
        },
      },
    },
    server: {
      port: 3000,
    },
  };
});
