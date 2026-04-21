import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';


export default defineConfig(({ mode }) => {
  const env    = loadEnv(mode, '.', '');
  const isProd = mode === 'production';

  return {
    base:    isProd ? './' : '/',
    root:    '.',
    publicDir: 'public',
    plugins: [react(), tailwindcss()],
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
