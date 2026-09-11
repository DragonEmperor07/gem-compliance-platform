import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const proxy = {
    '/api': { target: env.API_PROXY_TARGET || 'http://127.0.0.1:8000', changeOrigin: true, timeout: 300_000, proxyTimeout: 300_000 },
    '/health': { target: env.API_PROXY_TARGET || 'http://127.0.0.1:8000', changeOrigin: true, rewrite: () => '/' },
  };
  return { plugins: [react()], test: { include: ['src/**/*.test.ts', 'src/**/*.test.tsx'] }, server: { port: 5173, strictPort: true, proxy }, preview: { port: 4173, strictPort: true, proxy } };
});
