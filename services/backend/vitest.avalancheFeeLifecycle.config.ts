import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';

import base from './vitest.avalancheFeePublication.config';

const guard = process.env.AVALANCHE_GUARD_PACKAGE_JSON!;
const require = createRequire(guard);
const extended = resolve(
  dirname(guard),
  'node_modules/@rosen-bridge/extended-typeorm/dist',
);

export default {
  ...base,
  resolve: {
    alias: [
      {
        find: '@rosen-bridge/extended-typeorm/bootstrap',
        replacement: resolve(extended, 'bootstrap.js'),
      },
      {
        find: '@rosen-bridge/extended-typeorm',
        replacement: resolve(extended, 'index.js'),
      },
      {
        find: '@rosen-bridge/token-price-entity',
        replacement: resolve(
          import.meta.dirname,
          '../../packages/token-price-entity/lib/index.ts',
        ),
      },
      {
        find: '@rosen-bridge/winston-logger',
        replacement: require.resolve('@rosen-bridge/winston-logger'),
      },
      ...Object.entries(base.resolve.alias).map(([find, replacement]) => ({
        find,
        replacement,
      })),
    ],
  },
  test: {
    ...base.test,
    include: ['tests/index.spec.ts', 'tests/store.spec.ts'],
    testTimeout: 20000,
  },
};
