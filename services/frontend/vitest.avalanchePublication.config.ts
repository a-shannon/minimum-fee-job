import { resolve } from 'node:path';
import process from 'node:process';

const react = process.env.AVALANCHE_FRONTEND_REACT_FIXTURES;
const kv = process.env.AVALANCHE_PUBLICATION_KV_PACKAGE;
if (!react || !kv)
  throw new Error(
    'Required pinned fixtures: AVALANCHE_FRONTEND_REACT_FIXTURES and AVALANCHE_PUBLICATION_KV_PACKAGE',
  );
export default {
  css: { postcss: { plugins: [] } },
  esbuild: { jsx: 'automatic' },
  resolve: {
    alias: [
      { find: /^react$/, replacement: resolve(react, 'react/index.js') },
      {
        find: 'react/jsx-runtime',
        replacement: resolve(react, 'react/jsx-runtime.js'),
      },
      {
        find: 'react/jsx-dev-runtime',
        replacement: resolve(react, 'react/jsx-dev-runtime.js'),
      },
      {
        find: 'react-dom/server',
        replacement: resolve(react, 'react-dom/server.node.js'),
      },
      {
        find: 'react-test-renderer',
        replacement: resolve(react, 'react-test-renderer/index.js'),
      },
      { find: '@vercel/kv', replacement: kv },
      { find: '@', replacement: resolve('src') },
    ],
  },
  test: {
    globals: true,
    environment: 'node',
    fileParallelism: false,
    include: [
      'tests/avalanche/publication.spec.ts',
      'tests/store/avalanchePublication.spec.ts',
    ],
  },
};
