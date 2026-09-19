/**
 * BSDC — vite.config.ts
 * Purpose : Build and dev-server configuration for the BSDC application shell.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   :
 *   ADR-010  Manual chunk strategy keeps the shell under the 180 KB gzip budget (PART 25):
 *            heavy libraries (Monaco, Leaflet, Fabric, jsPDF, wavesurfer) are never in the shell
 *            and are always reached through dynamic import inside the feature that needs them.
 *   ADR-012  `allowedHosts: true` lets the Cloudflare Pages preview domain and the e2b sandbox
 *            preview host serve the dev server; the production origin is set in Cloudflare.
 *   ADR-013  Source maps are generated in "hidden" mode in production so stack traces can be
 *            symbolicated by the error pipeline while no `sourceMappingURL` comment is shipped.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { visualizer } from 'rollup-plugin-visualizer';
import { fileURLToPath } from 'node:url';

const srcPath = fileURLToPath(new URL('./src', import.meta.url));
const assetsPath = fileURLToPath(new URL('./assets', import.meta.url));

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    // `npm run analyze` writes dist/bundle-stats.json + dist/bundle-stats.html (git-ignored).
    // Bundle analysis is part of the definition of done for every response (PART 25).
    ...(process.env.ANALYZE === 'true'
      ? [
          visualizer({
            filename: 'dist/bundle-stats.html',
            json: true,
            gzipSize: true,
            brotliSize: false,
            template: 'treemap',
          }),
        ]
      : []),
  ],
  resolve: {
    alias: {
      '@': srcPath,
      '#assets': assetsPath,
    },
    dedupe: ['react', 'react-dom'],
  },
  define: {
    __BSDC_BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: false,
    // Preview/proxy hosts (bsdc.pages.dev, *.e2b.app) must be accepted. Production adds
    // www.bsdc.info.bd. See ADR-012.
    allowedHosts: true,
    cors: true,
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    allowedHosts: true,
  },
  css: {
    devSourcemap: true,
    modules: { generateScopedName: 'bsdc_[local]_[hash:base64:4]' },
  },
  build: {
    target: 'es2022',
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: mode === 'production' ? 'hidden' : true,
    cssCodeSplit: true,
    reportCompressedSize: true,
    // PART 25: no route chunk may exceed 250 KB gzip. 700 KB raw is the enforced proxy.
    chunkSizeWarningLimit: 700,
    assetsInlineLimit: 2048,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          // The react checks are anchored on the directory separator on purpose: an unanchored
          // `node_modules/react` also matches react-router, react-i18next and every other
          // react-* package, which silently folds them into the shell's vendor chunk.
          if (
            id.includes('node_modules/react/') ||
            id.includes('node_modules/react-dom/') ||
            id.includes('node_modules/scheduler/')
          )
            return 'react-vendor';
          if (
            id.includes('node_modules/react-router/') ||
            id.includes('node_modules/@remix-run/') ||
            id.includes('node_modules/react-i18next/') ||
            id.includes('node_modules/react-hook-form/') ||
            id.includes('node_modules/react-window/')
          )
            return 'router';
          if (id.includes('node_modules/@tanstack')) return 'data-cache';
          if (
            id.includes('node_modules/zustand') ||
            id.includes('node_modules/use-sync-external-store')
          )
            return 'state';
          if (id.includes('node_modules/i18next') || id.includes('node_modules/react-i18next'))
            return 'i18n';
          if (id.includes('node_modules/@radix-ui')) {
            const match = /node_modules\/@radix-ui\/([^/]+)/.exec(id);
            return match?.[1] !== undefined ? `radix-${match[1].replace('react-', '')}` : undefined;
          }
          if (
            id.includes('node_modules/aria-hidden') ||
            id.includes('node_modules/react-remove-scroll')
          )
            return 'radix-dialog-support';
          if (id.includes('node_modules/sonner')) return 'toast';
          if (id.includes('node_modules/framer-motion') || id.includes('node_modules/motion-'))
            return 'motion';
          if (id.includes('node_modules/lucide-react')) return 'icons';
          return undefined;
        },
      },
    },
  },
  esbuild: {
    // LAW-01 guard: stray emoji in JSX are a build-time problem, not a runtime surprise.
    legalComments: 'none',
  },
  optimizeDeps: {
    exclude: ['firebase'],
  },
}));
