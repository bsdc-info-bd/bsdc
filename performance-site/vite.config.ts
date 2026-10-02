import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The corporate kit is compiled from source rather than consumed as a
// package, so a change to a shared rule is type-checked and bundled by every
// console that depends on it in the same commit.
const kit = fileURLToPath(new URL('../corporate-kit/src', import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      { find: /^@kit$/, replacement: `${kit}/index.ts` },
      { find: '@kit', replacement: kit },
    ],
  },
  server: { host: '0.0.0.0', port: 5192, fs: { allow: ['..'] } },
  preview: { host: '0.0.0.0', port: 5192 },
  build: {
    target: 'es2022',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: (id: string) => (id.includes('node_modules') ? 'vendor' : undefined),
        entryFileNames: 'assets/index-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
      },
    },
  },
});
