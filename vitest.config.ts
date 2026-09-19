/**
 * BSDC — vitest.config.ts
 * Purpose : Test runner configuration for unit and component suites.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Two projects keep the fast node-environment unit suite separate from the jsdom
 *           component suite (PART 23.4). Fixtures are generated at runtime by builders in
 *           src/tests/fixtures — no demo data ever enters a production collection (LAW-02).
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const srcPath = fileURLToPath(new URL('./src', import.meta.url));
const assetsPath = fileURLToPath(new URL('./assets', import.meta.url));

export default defineConfig({
  resolve: {
    alias: { '@': srcPath, '#assets': assetsPath },
  },
  test: {
    globals: true,
    environment: 'node',
    restoreMocks: true,
    clearMocks: true,
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'node',
          include: ['src/**/*.test.ts', 'src/tests/unit/**/*.test.ts'],
          exclude: ['src/**/*.test.tsx'],
        },
      },
      {
        extends: true,
        test: {
          name: 'components',
          environment: 'jsdom',
          globals: true,
          setupFiles: ['src/tests/setup.ts'],
          include: ['src/**/*.test.tsx', 'src/tests/components/**/*.test.tsx'],
        },
      },
      {
        extends: true,
        test: {
          // The rule suites need a live emulator. They are never part of `npm run test`, which
          // stays runnable with nothing but node: `emulators:exec` supplies the emulator and then
          // `npm run test:rules` runs this project against it.
          name: 'rules',
          environment: 'node',
          include: ['tests/emulator/**/*.test.ts'],
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
