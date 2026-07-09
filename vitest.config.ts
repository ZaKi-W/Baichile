import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'packages/**/*.test.ts',
      'apps/cloud-functions/**/*.test.ts',
      'apps/client/**/*.test.ts',
      'apps/admin/**/*.test.ts',
    ],
    environment: 'node',
  },
  resolve: {
    alias: {
      '@baichile/api-contract': new URL('./packages/api-contract/src/index.ts', import.meta.url).pathname,
      '@baichile/catalog-data': new URL('./packages/catalog-data/src/index.ts', import.meta.url).pathname,
      '@baichile/domain': new URL('./packages/domain/src/index.ts', import.meta.url).pathname,
      '@baichile/map-core': new URL('./packages/map-core/src/index.ts', import.meta.url).pathname,
      '@baichile/catalog-schema': new URL('./packages/catalog-schema/src/index.ts', import.meta.url).pathname,
    },
  },
});
