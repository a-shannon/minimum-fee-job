import base from './vitest.avalancheFeeConstruction.config';

export default {
  ...base,
  test: {
    ...base.test,
    include: ['tests/minimum-fee/avalancheFeeConsumerJoin.spec.ts'],
  },
};
