import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // jsdom supplies window/navigator, which the Dexie store touches for storage
    // estimates and its raw-IndexedDB fallback.
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    // The storage layer logs heavily; keep passing runs readable but show the
    // output for anything that fails.
    silent: 'passed-only',
    restoreMocks: true,
  },
});
