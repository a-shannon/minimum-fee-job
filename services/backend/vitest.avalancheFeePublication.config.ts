import config from './vitest.avalancheFeeConstruction.config';

const sdk = process.env.AVALANCHE_PUBLICATION_KV_PACKAGE;
if (!sdk)
  throw new Error(
    'Required pinned KV fixture: AVALANCHE_PUBLICATION_KV_PACKAGE',
  );

export default {
  ...config,
  resolve: { alias: { ...config.resolve.alias, '@vercel/kv': sdk } },
  test: {
    ...config.test,
    // Initial WASM construction and module loading can exceed five seconds.
    testTimeout: 15000,
    include: [
      ...config.test.include,
      'tests/minimum-fee/publication.spec.ts',
      'tests/store.spec.ts',
    ],
  },
};
