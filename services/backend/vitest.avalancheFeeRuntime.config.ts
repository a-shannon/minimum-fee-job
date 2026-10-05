import { createRequire } from 'node:module';

const packagePath = process.env.AVALANCHE_GUARD_PACKAGE_JSON;
if (!packagePath)
  throw new Error('Required test fixture: AVALANCHE_GUARD_PACKAGE_JSON');
const require = createRequire(packagePath);

export default {
  resolve: { alias: { ethers: require.resolve('ethers') } },
  test: {
    globals: true,
    include: [
      'tests/configs/avalancheFee.spec.ts',
      'tests/network/avalancheFeeRuntime.spec.ts',
    ],
  },
};
