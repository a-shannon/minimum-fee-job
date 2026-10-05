const state = vi.hoisted(() => ({
  raw: undefined as unknown,
  source: undefined as unknown,
  boxes: new Map<string, unknown>(),
  fetchHook: undefined as undefined | (() => Promise<void>),
  fee: undefined as unknown,
  pinned: undefined as unknown,
}));
export { state };
/** Installs external collaborator factories before the scoped initialization hook. */
export const installIntegrationMocks = () => {
  vi.doMock('config', () => ({
    default: { has: () => state.raw !== undefined, get: () => state.raw },
  }));
  vi.doMock('@rosen-bridge/minimum-fee', async () => {
    const { pinnedFeeDependencies } = await import(
      '../fixtures/pinnedFeeDependencies'
    );
    const deps = pinnedFeeDependencies();
    state.pinned = deps;
    const Original = deps.fees.MinimumFeeBox;
    class TestBox extends Original {
      fetchBox = async () => {
        await state.fetchHook?.();
        this.box = state.boxes.get(this.tokenId);
        return !!this.box;
      };
    }
    return { ...deps.fees, MinimumFeeBox: TestBox };
  });
  vi.doMock('@rosen-bridge/tokens', async () => {
    const { pinnedFeeDependencies } = await import(
      '../fixtures/pinnedFeeDependencies'
    );
    return pinnedFeeDependencies().tokens;
  });
  vi.doMock('../../src/configs', () => ({
    get minimumFeeConfigs() {
      return state.fee;
    },
    ERG: 'erg',
    ADA: 'ada',
    BTC: 'btc',
    ETH: 'eth',
    BNB: 'bnb',
    DOGE: 'doge',
    FIRO: 'firo',
    HNS: 'hns',
    bridgeFeeTriggerPercent: 100,
    rsnRatioTriggerPercent: 100,
    networkFeeTriggerPercent: Object.fromEntries(
      [
        'ergo',
        'cardano',
        'bitcoin',
        'ethereum',
        'binance',
        'doge',
        'bitcoin-runes',
        'firo',
        'handshake',
      ].map((c) => [c, 100]),
    ),
    feeGuaranteeDuration: new Map(
      [
        'ergo',
        'cardano',
        'bitcoin',
        'ethereum',
        'binance',
        'doge',
        'bitcoin-runes',
        'firo',
        'handshake',
      ].map((c) => [c, 10]),
    ),
    urls: { ergoExplorer: 'https://fixture.invalid' },
  }));
  vi.doMock('../../src/network/clients', () => ({
    getBitcoinFeeRatio: async () => ({ '1': 1 }),
    getDogeFeeRatio: async () => 1,
    getFiroFeeRatio: async () => 1,
    getHandshakeFeeRatio: async () => 1,
    getEthereumFeeHistory: async () => ({ baseFeePerGas: ['1'] }),
  }));
};
