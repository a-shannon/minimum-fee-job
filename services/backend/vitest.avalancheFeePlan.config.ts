import runtimeConfig from './vitest.avalancheFeeRuntime.config';

export default {
  ...runtimeConfig,
  test: {
    ...runtimeConfig.test,
    include: [
      'tests/minimum-fee/avalancheFeePlan.spec.ts',
      'tests/network/avalancheFeeRuntime.spec.ts',
    ],
  },
};
