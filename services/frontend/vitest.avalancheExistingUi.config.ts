import base from './vitest.avalancheReview.config';

export default {
  ...base,
  test: {
    ...base.test,
    include: [
      'tests/validations/validateAvalancheNetworkFee.spec.ts',
      'tests/store/index.spec.ts',
      'tests/utils/getFeesByToken.spec.ts',
      'tests/avalanche/existingUi.spec.ts',
      'tests/queries/queryClient.spec.ts',
      'tests/app/page.spec.ts',
    ],
  },
};
