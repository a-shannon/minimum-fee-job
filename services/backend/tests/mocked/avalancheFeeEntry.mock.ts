const state = vi.hoisted(() => ({
  enabled: true,
  empty: false,
  missingKv: false,
  tx: {
    reducedTx: 'synthetic-reduced',
    sender: 'synthetic-address',
    inputs: ['input'],
  },
  published: vi.fn(),
  construct: vi.fn(),
  send: vi.fn(),
  scheduled: vi.fn(),
}));
export { state };
/** Installs this context's external and dispatch observations before importing the actual entry or store. */
export const installMocks = () => {
  vi.doMock('../../src/bootstrap', () => ({}));
  vi.doMock('../../src/configs', () => ({
    RunningInterval: 991337,
    tokensPath: 'synthetic-tokens',
    get kvRestApiUrl() {
      return state.missingKv ? undefined : 'https://synthetic-kv.invalid';
    },
    get kvRestApiToken() {
      return state.missingKv ? undefined : 'synthetic-token';
    },
    minimumFeeConfigs: {
      feeAddress: 'fee',
      minimumFeeAddress: 'config',
      RSNTokenId: 'rsn',
    },
  }));
  vi.doMock('../../src/database/initDataSource', () => ({
    initDataSource: async () => undefined,
  }));
  vi.doMock('../../src/tokenMap/tokenHandler', () => ({
    TokenHandler: {
      init: async () => undefined,
      getInstance: () => ({
        getSupportedTokens: () => [
          { tokenId: 'avax', ergoSideTokenId: 'wrapped', name: 'AVAX' },
        ],
        getTokenMap: () => ({ getConfig: () => [] }),
      }),
    },
  }));
  vi.doMock('../../src/minimum-fee/prices', () => ({
    getConfigTokenPrices: async () => ({
      fetched: true,
      prices: new Map([['avax', 2]]),
      errors: new Map(),
    }),
  }));
  vi.doMock('../../src/utils/saveTokenPrices', () => ({
    saveTokenPrices: async () => undefined,
  }));
  vi.doMock('../../src/utils/notifications', () => ({
    sendPriceFetchFailureNotification: vi.fn(),
  }));
  vi.doMock('../../src/network/clients', () => ({
    firoClient: { setupSocket: vi.fn() },
    getBinanceHeight: async () => 1,
    getBitcoinHeight: async () => 1,
    getCardanoHeight: async () => 1,
    getDogeHeight: async () => 1,
    getErgoHeight: async () => 1,
    getEthereumHeight: async () => 1,
    getFiroHeight: async () => 1,
    getHandshakeHeight: async () => 1,
  }));
  vi.doMock('../../src/minimum-fee/newConfig', () => ({
    generateNewFeeConfig: async () =>
      new Map([['avax', { getConfig: () => ({}) }]]),
  }));
  vi.doMock('../../src/minimum-fee/updateConfig', () => ({
    updateAndGenerateFeeConfig: async () => ({
      config: state.empty
        ? new Map()
        : new Map([['avax', { new: { getConfigs: () => [] } }]]),
      feeDifferences: new Map(),
    }),
  }));
  vi.doMock('../../src/minimum-fee/transaction', () => ({
    updateConfigsTransaction: async () => {
      state.construct();
      return state.tx;
    },
  }));
  vi.doMock('../../src/minimum-fee/avalancheFeeIntegration', () => ({
    usesAvalancheFeePublication: () => state.enabled,
    validateAvalancheFeeStartup: vi.fn(),
  }));
  vi.doMock('../../src/minimum-fee/publication', () => ({
    publishAvalancheFee: async (
      source: unknown,
      enqueue: (key: string, value: string) => Promise<unknown>,
    ) => {
      state.published(source);
      await enqueue('avalanche-fee-publication-v1', 'synthetic-envelope');
    },
  }));
  vi.doMock('../../src/network/notification', () => ({
    Notification: { getInstance: () => ({ send: state.send }) },
  }));
  vi.doMock('../../src/utils/utils', () => ({
    feeConfigToRegisterValues: () => [],
    pricesToTables: () => ({ brief: [], details: '' }),
  }));
};
