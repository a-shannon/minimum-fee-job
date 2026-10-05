import { createRequire } from 'node:module';

import base from './vitest.avalancheReview.config';

const require = createRequire(import.meta.url);

export default {
  ...base,
  resolve: {
    alias: base.resolve.alias.map((alias) =>
      String(alias.find).includes('react') &&
      !String(alias.find).includes('test-renderer')
        ? {
            ...alias,
            replacement: require.resolve(
              alias.find instanceof RegExp ? 'react' : String(alias.find),
            ),
          }
        : alias,
    ),
  },
  test: {
    ...base.test,
    server: { deps: { inline: [/node_modules/] } },
    setupFiles: ['tests/testUtils/existingUiReact.cjs'],
    include: [
      'tests/app/page.presentation.spec.tsx',
      'tests/containers/Qr.spec.tsx',
    ],
  },
};
