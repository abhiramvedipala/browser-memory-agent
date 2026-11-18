import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    // 16 GB machine shared with other builds: keep the pool small.
    maxWorkers: 4,
    testTimeout: 60_000,
    hookTimeout: 60_000,
    env: { LLM_MODE: 'replay' },
  },
});
