export default {
  test: {
    globals: true,
    include: [
      'tests/network/avalancheRpc.spec.ts',
      'tests/minimum-fee/avalancheFee.spec.ts',
    ],
  },
};
