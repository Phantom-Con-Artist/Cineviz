import { defineConfig } from 'vitest/config';

/**
 * Benchmarks and A/B reports (not part of `npm test`): `npm run bench` writes the
 * results as Markdown tables to bench/results/.
 */
export default defineConfig({
  test: {
    include: ['bench/**/*.report.ts'],
    testTimeout: 1_800_000,
  },
});
