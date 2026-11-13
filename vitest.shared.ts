import { defineConfig } from 'vitest/config';

/**
 * Shared Vitest config. Workspace packages export their TypeScript source under the
 * `development` condition, so tests run against source without building dependencies.
 */
export default defineConfig({
  resolve: { conditions: ['development'] },
  ssr: { resolve: { conditions: ['development'], externalConditions: ['development'] } },
  test: {
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    environment: 'node',
  },
});
