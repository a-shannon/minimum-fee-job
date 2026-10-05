import { createRequire } from 'node:module';

const path = process.env.AVALANCHE_GUARD_PACKAGE_JSON;
if (!path) throw new Error('Required fixture: AVALANCHE_GUARD_PACKAGE_JSON');
const require = createRequire(path);
const aliases = [
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
      aliases.map((name) => [name, require.resolve(name)]),
    ),
  },
  test: {
    globals: true,
    include: [
      'tests/minimum-fee/avalancheFeeIntegration.spec.ts',
      'tests/tokenMap/tokenHandler.spec.ts',
      'tests/minimum-fee/newConfig.spec.ts',
      'tests/minimum-fee/updateConfig.spec.ts',
    ],
  },
};
