import { createRequire } from 'node:module';

import base from './vitest.avalanchePublication.config';

const guard = process.env.AVALANCHE_GUARD_PACKAGE_JSON;
if (!guard) throw new Error('Required fixture: AVALANCHE_GUARD_PACKAGE_JSON');
const require = createRequire(guard);
export default {
  ...base,
  resolve: {
    alias: [
      ...base.resolve.alias,
      ...['ergo-lib-wasm-nodejs', '@rosen-bridge/minimum-fee'].map((name) => ({
        find: name,
        replacement: require.resolve(name),
      })),
    ],
  },
  test: {
    ...base.test,
    include: [
      'tests/avalanche/review.spec.ts',
      'tests/store/avalanchePublication.spec.ts',
    ],
  },
};
