import { state, installMocks } from '../mocked/avalancheFeeEntry.mock';

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
    vi.clearAllMocks();
    state.enabled = true;
    state.empty = false;
    state.missingKv = false;
    const { DefaultLogger, DummyLogger } = await import(
      '@rosen-bridge/abstract-logger'
    );
    DefaultLogger.init(new DummyLogger());
    const timeout = globalThis.setTimeout;
    vi.spyOn(globalThis, 'setTimeout').mockImplementation(((
      fn: () => void,
      delay: number,
      ...args: unknown[]
    ) => {
      if (delay === 991337) {
        state.scheduled();
        return { unref: () => undefined } as unknown as ReturnType<
          typeof setTimeout
        >;
      }
      return timeout(fn, delay, ...args);
    }) as typeof setTimeout);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
};
