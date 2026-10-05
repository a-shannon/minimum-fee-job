import { createRequire } from 'node:module';

const guard = process.env.AVALANCHE_GUARD_PACKAGE_JSON;
if (!guard) throw new Error('Required fixture: AVALANCHE_GUARD_PACKAGE_JSON');
const require = createRequire(guard);
const names = [
  'ethers',
  'lodash-es',
  'axios',
  'config',
  '@rosen-bridge/abstract-logger',
  '@rosen-bridge/json-bigint',
  '@rosen-bridge/tokens',
  '@rosen-bridge/minimum-fee',
  '@rosen-bridge/ergo-box-selection',
  'ergo-lib-wasm-nodejs',
];
export default {
  resolve: {
    alias: Object.fromEntries(
      names.map((name) => [name, require.resolve(name)]),
    ),
  },
  test: {
    globals: true,
    include: [
      'tests/minimum-fee/transaction.spec.ts',
      'tests/transaction/generate.spec.ts',
      'tests/minimum-fee/avalancheFeeIntegration.spec.ts',
      'tests/tokenMap/tokenHandler.spec.ts',
      'tests/minimum-fee/newConfig.spec.ts',
      'tests/minimum-fee/updateConfig.spec.ts',
    ],
  },
};
