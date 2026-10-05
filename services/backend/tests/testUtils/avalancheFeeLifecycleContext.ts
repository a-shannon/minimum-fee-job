import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import { createRequire } from 'node:module';
import { join } from 'node:path';

import { state, installMocks } from '../mocked/avalancheFeeLifecycle.mock';
import { lifecycleFixture, type Mode } from './avalancheFeeLifecycle';

/** Actual inspectors loaded after the pinned legacy dependency observations are registered. */
export let inspectAvalancheFeeEconomics: typeof import('../../../frontend/src/avalanche/economics').inspectAvalancheFeeEconomics;
export let decodeAvalanchePublication: typeof import('../../../frontend/src/avalanche/publication').decodeAvalanchePublication;
export let inspectAvalancheFeeStructure: typeof import('../../../frontend/src/avalanche/validation').inspectAvalancheFeeStructure;
export let directory: string;
export let source:
  | {
      isInitialized: boolean;
      destroy(): Promise<void>;
      query(sql: string): Promise<Record<string, unknown>[]>;
    }
  | undefined;
/** Runs the actual service against fresh JSON, SQLite, synthetic chain observations and intercepted KV fetch. */
export const run = async (
  mode: Mode,
  chainId: 43113 | 43114 = 43113,
  existing = false,
  configure?: (config: ReturnType<typeof lifecycleFixture>['config']) => void,
  beforeStartup?: () => Promise<void>,
) => {
  const fixture = lifecycleFixture(directory, mode, chainId, existing);
  configure?.(fixture.config);
  writeFileSync(
    join(directory, 'default.json'),
    JSON.stringify(fixture.config),
  );
  state.boxes = fixture.boxes;
  state.funding = fixture.funding;
  state.context = fixture.context;
  // A fresh real node-config instance reads the on-disk JSON, avoiding its process-wide CJS cache between cases.
  vi.stubEnv('NODE_CONFIG_DIR', directory);
  const require = createRequire(process.env.AVALANCHE_GUARD_PACKAGE_JSON!);
  const configPath = require.resolve('config');
  delete require.cache[configPath];
  const config = require('config');
  vi.doMock('config', () => ({ default: config }));
  const commands: unknown[][] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, options: { body: string }) => {
      if (url !== 'https://synthetic-kv.invalid/pipeline')
        throw new Error(`Unexpected network fetch: ${url}`);
      const batch = JSON.parse(options.body) as unknown[][];
      commands.push(...batch);
      return new Response(JSON.stringify(batch.map(() => ({ result: 'OK' }))), {
        status: 200,
      });
    }),
  );
  const timeout = globalThis.setTimeout;
  let finish!: () => void;
  const finished = new Promise<void>((resolve) => {
    finish = resolve;
  });
  vi.spyOn(globalThis, 'setTimeout').mockImplementation(((
    fn: () => void,
    delay: number,
    ...args: unknown[]
  ) => {
    if (delay === 991337) {
      state.scheduled();
      finish();
      return { unref: () => undefined } as unknown as ReturnType<
        typeof setTimeout
      >;
    }
    return timeout(fn, delay, ...args);
  }) as typeof setTimeout);
  let error: unknown;
  try {
    await beforeStartup?.();
    await import('../../src/index');
    await finished;
  } catch (caught) {
    error = caught;
  }
  source = (await import('../../src/database/dataSource')).dataSource;
  return { ...fixture, commands, error };
};
/** Registers this context's original module reset, observation setup and cleanup around each case. */
export const registerContext = () => {
  beforeEach(async () => {
    for (const module of [
      'node:process',
      '@rosen-bridge/tokens',
      '@rosen-bridge/minimum-fee',
      '../../src/network/notification',
      '../../src/network/clients',
      '../../src/network/fetchPriceFromCoingecko',
      '../../src/network/avalancheFeeRuntime',
      '../../src/bootstrap',
      '../../src/configs',
      '../../src/database/initDataSource',
      '../../src/tokenMap/tokenHandler',
      '../../src/minimum-fee/prices',
      '../../src/utils/saveTokenPrices',
      '../../src/utils/notifications',
      '../../src/minimum-fee/newConfig',
      '../../src/minimum-fee/updateConfig',
      '../../src/minimum-fee/transaction',
      '../../src/minimum-fee/avalancheFeeIntegration',
      '../../src/minimum-fee/publication',
      '../../src/utils/utils',
      'config',
    ])
      vi.doUnmock(module);
    installMocks();
    vi.resetModules();
    ({ inspectAvalancheFeeEconomics } = await import(
      '../../../frontend/src/avalanche/economics'
    ));
    ({ decodeAvalanchePublication } = await import(
      '../../../frontend/src/avalanche/publication'
    ));
    ({ inspectAvalancheFeeStructure } = await import(
      '../../../frontend/src/avalanche/validation'
    ));
    vi.clearAllMocks();
    state.rpc = [];
    state.legacy = [];
    state.notifications = [];
    source = undefined;
    const root = process.env.AVALANCHE_LIFECYCLE_ARTIFACT_ROOT;
    if (!root)
      throw new Error(
        'Required external artifact root: AVALANCHE_LIFECYCLE_ARTIFACT_ROOT',
      );
    mkdirSync(root, { recursive: true });
    directory = mkdtempSync(join(root, 'case-'));
    // No fallback to an actual HTTP endpoint, even when a fixture is incomplete.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('Unexpected network fetch');
      }),
    );
    vi.spyOn(http, 'request').mockImplementation(() => {
      throw new Error('Unexpected HTTP request');
    });
    vi.spyOn(https, 'request').mockImplementation(() => {
      throw new Error('Unexpected HTTPS request');
    });
  });
  afterEach(async () => {
    if (source?.isInitialized) await source.destroy();
    for (const box of [...state.boxes.values(), ...state.funding])
      (box as { free(): void }).free();
    (state.context as { free(): void } | undefined)?.free();
    state.boxes.clear();
    state.funding = [];
    state.context = undefined;
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });
};
