// Match the separately pinned renderer to the package's existing React runtime.
const { createRequire } = require('node:module');
const { resolve } = require('node:path');
const assert = require('node:assert/strict');
const packageRequire = createRequire(resolve(__dirname, '../../package.json'));
assert.equal(packageRequire('react/package.json').version, '18.3.1');
const existing = packageRequire.resolve('react');
packageRequire(existing);
require.cache[
  resolve(process.env.AVALANCHE_FRONTEND_REACT_FIXTURES, 'react/index.js')
] = require.cache[existing];
