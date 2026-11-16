import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { build as viteBuild, type Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

/**
 * Compiles the push-only service worker (`src/sw.ts`) into `dist/sw.js` with
 * zero Workbox precaching and zero fetch/image/offline interception.
 */
function pushServiceWorkerPlugin(): Plugin {
  return {
    name: 'bsdc-push-service-worker',
    apply: 'build',
    async closeBundle() {
      await viteBuild({
        configFile: false,
        logLevel: 'silent',
        resolve: {
          alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
        },
        define: {
          'import.meta.env.VITE_PUSH_VAPID_PUBLIC_KEY': JSON.stringify(
            process.env.VITE_PUSH_VAPID_PUBLIC_KEY ?? '',
          ),
        },
        build: {
          outDir: fileURLToPath(new URL('./dist', import.meta.url)),
          emptyOutDir: false,
          sourcemap: false,
          minify: 'esbuild',
          target: 'es2022',
          rollupOptions: {
            input: fileURLToPath(new URL('./src/sw.ts', import.meta.url)),
            output: {
              entryFileNames: 'sw.js',
              format: 'iife',
              inlineDynamicImports: true,
            },
          },
        },
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), pushServiceWorkerPlugin()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: false,
  },
  preview: { host: '0.0.0.0', port: 4173 },
  build: {
    target: 'es2022',
    sourcemap: false,
    cssCodeSplit: true,
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          // framer-motion is used only by lazy routes, so it loads with them instead of on
          // every first paint (it was preloaded by index.html and counted against the budget).
          'vendor-i18n': ['i18next', 'react-i18next'],
        },
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    include: ['src/**/*.test.{ts,tsx}', 'functions/**/*.test.ts'],
  },
});
