import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    server: {
      port: 3000,
      strictPort: true,
      host: '0.0.0.0',
      allowedHosts: true,
      // Disable HMR websocket in Docker+Windows to avoid intermittent ws resets.
      hmr: false,
      watch: {
        usePolling: true,
        ignored: [
          '**/backend/**',
          '**/docker/**',
          '**/.git/**',
          '**/dist/**',
          '**/node_modules/**',
        ],
      },
    },
    optimizeDeps: {
      // Avoid dependency scanner crashes in this workspace layout.
      noDiscovery: true,
      include: [],
    },
    plugins: [react()],
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
  };
});

