import { state, installMocks } from '../mocked/avalancheFeeStore.mock';

/** Registers this context's original module reset, observation setup and cleanup around each case. */
export const registerContext = () => {
  beforeEach(() => {
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
    state.url = 'https://synthetic-kv.invalid';
    state.token = 'synthetic-fixture-token';
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
};
