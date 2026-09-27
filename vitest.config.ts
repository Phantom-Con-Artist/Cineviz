import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    // The analysis and headless-show tests render and simulate whole songs
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
