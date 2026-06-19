import path from 'path';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig(() => {
  const vendorChunkMap: Array<[string, string]> = [
    ['@tsparticles', 'particles-vendor'],
    ['framer-motion', 'motion-vendor'],
    ['recharts', 'charts-vendor'],
    ['@paypal', 'payments-vendor'],
    ['lucide-react', 'icons-vendor'],
    ['react-router', 'router-vendor'],
    ['notyf', 'feedback-vendor'],
  ];
  return {
    server: {
      port: 3000,
      strictPort: true,
      host: '0.0.0.0',
      allowedHosts: true,
      // Disable HMR websocket in Docker+Windows to avoid intermittent ws resets.
      hmr: false,
      // Google Sign-In opens a popup that posts the credential back via window.postMessage.
      // Without this, the popup's COOP response severs window.opener and the message is dropped.
      headers: {
        'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
      },
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
    // Docker dev container runs `vite preview` (CMD in docker/Dockerfile.dev), not the dev server,
    // so the COOP header must be set here too or the preview server never sends it.
    preview: {
      port: 3000,
      strictPort: true,
      host: '0.0.0.0',
      allowedHosts: true,
      headers: {
        'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
      },
    },
    optimizeDeps: {
      // Avoid dependency scanner crashes in this workspace layout.
      noDiscovery: true,
      include: [],
    },
    plugins: [react()],
    test: {
      environment: 'jsdom',
      environmentOptions: {
        jsdom: { url: 'http://localhost:3000' },
      },
      setupFiles: './src/test/setup.ts',
      css: false,
    },
    build: {
      target: 'es2020',
      minify: 'esbuild',
      sourcemap: false,
      cssMinify: true,
      reportCompressedSize: false,
      chunkSizeWarningLimit: 600,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return;

            for (const [pkg, chunkName] of vendorChunkMap) {
              if (id.includes(pkg)) return chunkName;
            }

            if (id.includes('react') || id.includes('scheduler')) {
              return 'react-vendor';
            }
          },
        },
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
  };
});
