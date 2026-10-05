import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  statfsSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const archivePackages = [
  ['AVALANCHE_FEE_V3_ARCHIVE', '@rosen-bridge/minimum-fee@3.1.2'],
  ['AVALANCHE_TOKENS_V5_ARCHIVE', '@rosen-bridge/tokens@5.0.0'],
  ['AVALANCHE_SEMAPHORE_ARCHIVE', 'await-semaphore@0.1.3'],
];
const archivePins = {
  AVALANCHE_FEE_V3_ARCHIVE:
    'jixoO+JwD/+YDRHmzeTABrXBqtKao91pj2TBDHAOru6Hd63nvJ4bRpJv+cGQmXAkVdDdhNNUaCy5OFS0A3J/uA==',
  AVALANCHE_TOKENS_V5_ARCHIVE:
    'KNr5/wBPcbEBSfXgfgpYIEr+Mz+ebeEankzFFWV1b2lBE8B68GhF973c4NtkC4+Hw1L+d85dtWCH+1um6T6ZcA==',
  AVALANCHE_SEMAPHORE_ARCHIVE:
    'd1W2aNSYcz/sxYO4pMGX9vq65qOTu0P800epMud+6cYYX0QcT7zyqcxec3VWzpgvdXo57UWmVbZpLMjX2m1I7Q==',
};
const dependencies = {
  'ethers': '6.16.0',
  'lodash-es': '4.17.21',
  'axios': '1.13.4',
  'config': '3.3.12',
  '@rosen-bridge/abstract-logger': '4.0.0',
  '@rosen-bridge/json-bigint': '1.1.0',
  '@rosen-bridge/tokens': '6.0.2',
  '@rosen-bridge/minimum-fee': '4.0.1',
  '@rosen-bridge/ergo-box-selection': '2.1.1',
  'ergo-lib-wasm-nodejs': '0.24.1',
  '@rosen-bridge/winston-logger': '3.1.0',
  'sqlite3': '5.1.7',
  'react': '18.3.1',
  'react-dom': '18.3.1',
  'react-test-renderer': '18.3.1',
  '@vercel/kv': '3.0.0',
  '@upstash/redis': '1.34.2',
};

/** Reads fixture paths and rejects ambiguous, unknown or repeated options. */
const options = () => {
  const result = {};
  const args = process.argv.slice(2);
  for (let index = 0; index < args.length; index++) {
    const key = args[index];
    assert.ok(
      ['--output', '--utils-root', '--npm-cli', '--run'].includes(key),
      `Unknown option: ${key}`,
    );
    assert.ok(!Object.hasOwn(result, key), `Repeated option: ${key}`);
    if (key === '--run') result[key] = true;
    else {
      const value = args[++index];
      assert.ok(value && !value.startsWith('--'), `Missing value: ${key}`);
      result[key] = resolve(value);
    }
  }
  assert.ok(result['--output'], 'Required: --output <new directory>');
  assert.ok(result['--utils-root'], 'Required: --utils-root <utils checkout>');
  result['--npm-cli'] ??= process.env.npm_execpath;
  assert.ok(
    result['--npm-cli'] && existsSync(result['--npm-cli']),
    'Run through npm run prepare:avalanche-fixtures or supply --npm-cli <npm-cli.js>',
  );
  return result;
};

/** Runs npm directly through Node and preserves each command's diagnostic log. */
const npm = (cli, args, cwd, log) => {
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd,
    env: process.env,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  writeFileSync(log, (result.stdout ?? '') + (result.stderr ?? ''));
  assert.ifError(result.error);
  assert.equal(result.status, 0, `npm failed; see ${log}`);
  return result.stdout;
};

/** Pins an emitted file without importing or executing its content. */
const digest = (filename, algorithm = 'sha256', encoding = 'hex') =>
  createHash(algorithm).update(readFileSync(filename)).digest(encoding);

/** Creates a fresh dependency tree, archive pins and reusable test environment. */
const prepare = () => {
  const opts = options();
  const [major, minor] = process.versions.node.split('.').map(Number);
  assert.ok(major > 22 || (major === 22 && minor >= 18), 'Node >=22.18.0');
  const output = opts['--output'];
  assert.ok(!existsSync(output), 'Output must be a new directory');
  let ancestor = dirname(output);
  while (!existsSync(ancestor)) ancestor = dirname(ancestor);
  const space = statfsSync(ancestor, { bigint: true });
  assert.ok(
    space.bavail * space.bsize >= 10n * 1024n ** 3n,
    'Need 10 GiB free',
  );
  const extended = join(opts['--utils-root'], 'packages', 'extended-typeorm');
  const metadata = JSON.parse(
    readFileSync(join(extended, 'package.json'), 'utf8'),
  );
  assert.equal(metadata.name, '@rosen-bridge/extended-typeorm');
  const archives = join(output, 'archives');
  const logs = join(output, 'logs');
  mkdirSync(archives, { recursive: true });
  mkdirSync(logs);
  const cli = opts['--npm-cli'];
  const npmVersion = npm(
    cli,
    ['--version'],
    repository,
    join(logs, 'npm.log'),
  ).trim();
  assert.equal(npmVersion, '11.6.2', 'Use repository npm 11.6.2');
  npm(
    cli,
    ['run', 'build'],
    extended,
    join(logs, 'extended-typeorm-build.log'),
  );
  assert.ok(
    existsSync(join(extended, 'dist', 'bootstrap.js')),
    'Missing bootstrap',
  );
  const pack = (specifier, name) => {
    const result = JSON.parse(
      npm(
        cli,
        [
          'pack',
          specifier,
          '--pack-destination',
          archives,
          '--ignore-scripts',
          '--json',
        ],
        repository,
        join(logs, `${name}.log`),
      ),
    );
    assert.equal(result.length, 1, 'Expected one npm archive');
    assert.equal(result[0].filename, result[0].filename.split(/[\\/]/).pop());
    return join(archives, result[0].filename);
  };
  const localArchive = pack(extended, 'extended-typeorm-pack');
  const environment = {};
  for (const [name, specifier] of archivePackages) {
    environment[name] = pack(specifier, name);
    assert.equal(
      digest(environment[name], 'sha512', 'base64'),
      archivePins[name],
      name,
    );
  }
  const manifest = {
    name: 'avalanche-fee-test-fixtures',
    version: '0.0.0',
    private: true,
    type: 'module',
    dependencies: {
      ...dependencies,
      '@rosen-bridge/extended-typeorm': `file:archives/${localArchive.split(/[\\/]/).pop()}`,
    },
  };
  const packageFile = join(output, 'package.json');
  writeFileSync(packageFile, JSON.stringify(manifest, null, 2) + '\n');
  npm(
    cli,
    ['install', '--no-audit', '--no-fund'],
    output,
    join(logs, 'install.log'),
  );
  const fixtureRequire = createRequire(packageFile);
  environment.AVALANCHE_GUARD_PACKAGE_JSON = packageFile;
  environment.AVALANCHE_FRONTEND_REACT_FIXTURES = join(output, 'node_modules');
  environment.AVALANCHE_PUBLICATION_KV_PACKAGE = join(
    dirname(fixtureRequire.resolve('@vercel/kv')),
    'index.js',
  );
  environment.AVALANCHE_AUTHORITY_ARTIFACT_ROOT = join(output, 'authority');
  environment.AVALANCHE_LIFECYCLE_ARTIFACT_ROOT = join(output, 'lifecycle');
  mkdirSync(environment.AVALANCHE_AUTHORITY_ARTIFACT_ROOT);
  mkdirSync(environment.AVALANCHE_LIFECYCLE_ARTIFACT_ROOT);
  writeFileSync(
    join(output, 'environment.json'),
    JSON.stringify(environment, null, 2) + '\n',
  );
  writeFileSync(
    join(output, 'fixture-receipt.json'),
    JSON.stringify(
      {
        node: process.versions.node,
        npm: npmVersion,
        packageLockSha256: digest(join(output, 'package-lock.json')),
        candidate: {
          name: metadata.name,
          version: metadata.version,
          sha256: digest(localArchive),
        },
        archives: Object.fromEntries(
          archivePackages.map(([name, specifier]) => [
            specifier,
            digest(environment[name], 'sha512', 'base64'),
          ]),
        ),
      },
      null,
      2,
    ) + '\n',
  );
  console.log(`Fixture environment ready: ${join(output, 'environment.json')}`);
  if (opts['--run']) {
    const result = spawnSync(
      process.execPath,
      ['--import', 'tsx', join(repository, 'scripts', 'test-avalanche.mjs')],
      {
        cwd: repository,
        env: { ...process.env, ...environment },
        stdio: 'inherit',
      },
    );
    assert.ifError(result.error);
    assert.equal(result.status, 0, 'Avalanche fee test target failed');
  }
};

prepare();
