import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(repository, 'package.json'));
const archivePins = {
  AVALANCHE_FEE_V3_ARCHIVE:
    'jixoO+JwD/+YDRHmzeTABrXBqtKao91pj2TBDHAOru6Hd63nvJ4bRpJv+cGQmXAkVdDdhNNUaCy5OFS0A3J/uA==',
  AVALANCHE_TOKENS_V5_ARCHIVE:
    'KNr5/wBPcbEBSfXgfgpYIEr+Mz+ebeEankzFFWV1b2lBE8B68GhF973c4NtkC4+Hw1L+d85dtWCH+1um6T6ZcA==',
  AVALANCHE_SEMAPHORE_ARCHIVE:
    'd1W2aNSYcz/sxYO4pMGX9vq65qOTu0P800epMud+6cYYX0QcT7zyqcxec3VWzpgvdXo57UWmVbZpLMjX2m1I7Q==',
};
const requiredEnvironment = [
  'AVALANCHE_GUARD_PACKAGE_JSON',
  ...Object.keys(archivePins),
  'AVALANCHE_FRONTEND_REACT_FIXTURES',
  'AVALANCHE_PUBLICATION_KV_PACKAGE',
  'AVALANCHE_AUTHORITY_ARTIFACT_ROOT',
  'AVALANCHE_LIFECYCLE_ARTIFACT_ROOT',
];
const configurations = {
  backend: [
    'avalanche',
    'avalancheChainFee',
    'avalancheFeeRuntime',
    'avalancheFeePlan',
    'avalancheFeeIntegration',
    'avalancheFeeConstruction',
    'avalancheFeePublication',
    'avalancheFeeLifecycle',
    'avalancheFeeConsumerJoin',
    'avalancheFeeEconomicsJoin',
  ],
  frontend: [
    'avalanchePublication',
    'avalancheReview',
    'avalancheStructure',
    'avalancheEconomics',
    'avalancheEconomicReview',
    'avalancheExistingUi',
    'avalancheExistingUiPresentation',
  ],
};
const jobs = {
  backend: [
    ['avalanche'],
    ['avalancheChainFee'],
    ['avalancheFeeRuntime'],
    ['avalancheFeePlan', 'tests/minimum-fee/avalancheFeePlan.spec.ts'],
    ['avalancheFeePublication'],
    ['avalancheFeeLifecycle', 'tests/index.spec.ts'],
    ['avalancheFeeConsumerJoin'],
    ['avalancheFeeEconomicsJoin'],
  ],
  frontend: [
    ['avalanchePublication'],
    ['avalancheReview', 'tests/avalanche/review.spec.ts'],
    ['avalancheStructure'],
    ['avalancheEconomics'],
    ['avalancheEconomicReview'],
    ['avalancheExistingUi'],
    ['avalancheExistingUiPresentation'],
  ],
};

/** Reads the optional service selector and rejects unsupported arguments. */
const selectedServices = () => {
  const args = process.argv.slice(2);
  if (args.length === 0) return ['backend', 'frontend'];
  assert.equal(args.length, 2, 'Expected --service backend or frontend');
  assert.equal(args[0], '--service', 'Expected --service backend or frontend');
  assert.ok(
    Object.hasOwn(configurations, args[1]),
    'Service must be backend or frontend',
  );
  return [args[1]];
};

/** Finds package metadata above a resolved entry without executing the package. */
const packageMetadata = (entry, name) => {
  let directory = dirname(entry);
  while (true) {
    const filename = join(directory, 'package.json');
    if (existsSync(filename)) {
      const metadata = JSON.parse(readFileSync(filename, 'utf8'));
      if (metadata.name === name) return metadata;
    }
    const parent = dirname(directory);
    assert.notEqual(parent, directory, `Package metadata missing: ${name}`);
    directory = parent;
  }
};

/** Requires a regular fixture file and returns its absolute configured path. */
const fixtureFile = (name) => {
  const filename = resolve(process.env[name]);
  assert.ok(statSync(filename).isFile(), `Fixture must be a file: ${name}`);
  return filename;
};

/** Validates the complete fixture contract before importing test configs or creating reports. */
const preflight = () => {
  const [major, minor] = process.versions.node.split('.').map(Number);
  assert.ok(
    major > 22 || (major === 22 && minor >= 18),
    'Node 22.18.0 or newer is required',
  );
  for (const name of requiredEnvironment)
    assert.ok(process.env[name], `Required fixture: ${name}`);
  for (const name of requiredEnvironment)
    process.env[name] = resolve(process.env[name]);
  for (const [name, integrity] of Object.entries(archivePins))
    assert.equal(
      createHash('sha512')
        .update(readFileSync(fixtureFile(name)))
        .digest('base64'),
      integrity,
      `Pinned archive integrity mismatch: ${name}`,
    );
  const fixtureRequire = createRequire(
    fixtureFile('AVALANCHE_GUARD_PACKAGE_JSON'),
  );
  const feeEntry = fixtureRequire.resolve('@rosen-bridge/minimum-fee');
  const wasmEntry = fixtureRequire.resolve('ergo-lib-wasm-nodejs');
  assert.equal(
    packageMetadata(feeEntry, '@rosen-bridge/minimum-fee').version,
    '4.0.1',
    'The downstream minimum-fee parser fixture must be 4.0.1',
  );
  assert.equal(
    packageMetadata(wasmEntry, 'ergo-lib-wasm-nodejs').version,
    '0.24.1',
    'The WASM fixture must be 0.24.1',
  );
  assert.equal(
    createHash('sha256')
      .update(readFileSync(join(dirname(feeEntry), 'utils.js')))
      .digest('hex'),
    '29bf09160751542324333147c79973efc6dbb91c2cb93fb2e98a553a090f4d09',
    'Downstream minimum-fee parser bytes changed',
  );
  const reactRoot = resolve(process.env.AVALANCHE_FRONTEND_REACT_FIXTURES);
  for (const name of ['react', 'react-dom', 'react-test-renderer'])
    assert.equal(
      JSON.parse(readFileSync(join(reactRoot, name, 'package.json'), 'utf8'))
        .version,
      '18.3.1',
      `The ${name} fixture must be 18.3.1`,
    );
  assert.equal(
    packageMetadata(
      fixtureFile('AVALANCHE_PUBLICATION_KV_PACKAGE'),
      '@vercel/kv',
    ).version,
    '3.0.0',
    'The KV fixture must be 3.0.0',
  );
  assert.equal(
    packageMetadata(
      createRequire(fixtureFile('AVALANCHE_PUBLICATION_KV_PACKAGE')).resolve(
        '@upstash/redis',
      ),
      '@upstash/redis',
    ).version.replace(/^v/, ''),
    '1.34.2',
    'The KV transport fixture must be 1.34.2',
  );
  const vitestPackage = require.resolve('vitest/package.json');
  const loader = require.resolve('tsx/esm');
  return {
    cli: join(dirname(vitestPackage), 'vitest.mjs'),
    loader,
    versions: {
      node: process.versions.node,
      vitest: JSON.parse(readFileSync(vitestPackage, 'utf8')).version,
      tsx: packageMetadata(loader, 'tsx').version,
    },
  };
};

/** Imports every owned config and proves the job selections cover each declared spec exactly once. */
const selectJobs = async (services) => {
  const selected = [];
  for (const service of services) {
    const directory = join(repository, 'services', service);
    const configs = new Map();
    const declared = new Set();
    for (const name of configurations[service]) {
      const filename = join(directory, `vitest.${name}.config.ts`);
      const config = (await import(pathToFileURL(filename).href)).default;
      assert.ok(Array.isArray(config.test.include), `Missing include: ${name}`);
      for (const spec of config.test.include) {
        assert.ok(spec.endsWith('.spec.ts') || spec.endsWith('.spec.tsx'));
        assert.ok(existsSync(join(directory, spec)), `Missing spec: ${spec}`);
        declared.add(spec);
      }
      configs.set(name, { filename, include: config.test.include });
    }
    const admitted = new Set();
    for (const [name, ...filters] of jobs[service]) {
      const config = configs.get(name);
      const specs = filters.length ? filters : config.include;
      for (const spec of specs) {
        assert.ok(
          config.include.includes(spec),
          `Filter outside config: ${spec}`,
        );
        assert.ok(!admitted.has(spec), `Duplicate selected spec: ${spec}`);
        admitted.add(spec);
      }
      selected.push({
        service,
        name,
        directory,
        config: config.filename,
        specs,
      });
    }
    assert.deepEqual([...admitted].sort(), [...declared].sort());
    assert.equal(admitted.size, service === 'backend' ? 17 : 16);
  }
  return selected;
};

/** Runs one config selection and verifies its report contains exactly those spec files and positive passing cases. */
const runJob = (job, tools, reportRoot) => {
  const report = join(reportRoot, `${job.service}-${job.name}.json`);
  const child = spawnSync(
    process.execPath,
    [
      tools.cli,
      'run',
      '--config',
      job.config,
      '--no-cache',
      '--maxWorkers=2',
      '--reporter=json',
      `--outputFile=${report}`,
      ...job.specs,
    ],
    {
      cwd: job.directory,
      env: {
        ...process.env,
        NODE_OPTIONS: `--import ${pathToFileURL(tools.loader).href}`,
        NODE_BACKEND: 'js',
        NODE_ENV: 'test',
      },
      encoding: 'utf8',
      timeout: 180000,
      maxBuffer: 32 * 1024 * 1024,
      windowsHide: true,
    },
  );
  writeFileSync(report.replace(/\.json$/, '.log'), child.stdout + child.stderr);
  assert.equal(child.status, 0, `Failed test job: ${job.service}/${job.name}`);
  const result = JSON.parse(readFileSync(report, 'utf8'));
  assert.equal(result.success, true);
  assert.equal(result.numFailedTests, 0);
  assert.deepEqual(
    result.testResults.map((test) => resolve(test.name)).sort(),
    job.specs.map((spec) => resolve(job.directory, spec)).sort(),
    'Executed spec files differ from the selected job',
  );
  const cases = result.testResults.flatMap((test) => {
    assert.ok(test.assertionResults.length > 0, 'Empty test file');
    return test.assertionResults.map((item) => {
      assert.equal(item.status, 'passed', 'Every selected case must pass');
      return {
        file: relative(repository, test.name).replaceAll('\\', '/'),
        groups: item.ancestorTitles,
        title: item.title,
      };
    });
  });
  assert.equal(cases.length, result.numPassedTests);
  console.log(`${job.service}/${job.name}: ${cases.length} passed`);
  return {
    service: job.service,
    config: job.name,
    passed: cases.length,
    cases,
  };
};

/** Validates fixtures, runs the complete selected service matrix, and saves the exact case inventory. */
const main = async () => {
  const services = selectedServices();
  const tools = preflight();
  const selected = await selectJobs(services);
  const reportRoot = join(
    repository,
    '.cache',
    `avalanche-tests-${randomUUID()}`,
  );
  mkdirSync(reportRoot, { recursive: true });
  for (const name of [
    'AVALANCHE_AUTHORITY_ARTIFACT_ROOT',
    'AVALANCHE_LIFECYCLE_ARTIFACT_ROOT',
  ])
    mkdirSync(resolve(process.env[name]), { recursive: true });
  const results = selected.map((job) => runJob(job, tools, reportRoot));
  const summary = {
    services,
    versions: tools.versions,
    jobs: results,
    files: results
      .flatMap((job) => job.cases.map((item) => item.file))
      .filter((item, index, all) => all.indexOf(item) === index).length,
    passed: results.reduce((sum, job) => sum + job.passed, 0),
  };
  writeFileSync(
    join(reportRoot, 'summary.json'),
    JSON.stringify(summary, null, 2),
  );
  console.log(
    `Reports: ${relative(repository, reportRoot).replaceAll('\\', '/')}`,
  );
};

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
