import base from './vitest.avalancheReview.config';

export default {
  ...base,
  test: {
    ...base.test,
    include: [
      'tests/avalanche/economicAuthority.spec.ts',
      'tests/avalanche/economicReview.spec.ts',
    ],
  },
};
