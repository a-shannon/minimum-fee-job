import { createRequire } from 'node:module';

const guard = process.env.AVALANCHE_GUARD_PACKAGE_JSON;
if (!guard)
  throw new Error('Required pinned fixture: AVALANCHE_GUARD_PACKAGE_JSON');
const require = createRequire(guard);
export default {
  css: { postcss: { plugins: [] } },
  resolve: {
    alias: Object.fromEntries(
      ['ergo-lib-wasm-nodejs', '@rosen-bridge/minimum-fee'].map((name) => [
        name,
        require.resolve(name),
      ]),
    ),
  },
  test: {
    globals: true,
    environment: 'node',
    include: [
      'tests/avalanche/transaction.spec.ts',
      'tests/avalanche/validation.spec.ts',
    ],
  },
};
