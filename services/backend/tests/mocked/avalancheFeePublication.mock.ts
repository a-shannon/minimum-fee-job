const state = vi.hoisted(() => ({
  raw: undefined as unknown,
  fee: undefined as unknown,
  source: undefined as unknown,
  box: undefined as unknown,
  extraBox: undefined as unknown,
  funding: [] as unknown[],
  context: undefined as unknown,
  hook: undefined as undefined | ((phase: string) => Promise<void>),
  calls: [] as string[],
  legacyPrices: new Map<string, number>(),
  generationHook: undefined as undefined | (() => void),
  plan: undefined as unknown,
}));
export { state };
/** Installs the original plan/TokenHandler observations, box-fetch seam and real selection wrapper for publication provenance tests. */
export const installPublicationMocks = () => {
  vi.doMock('config', () => ({
    default: { has: () => state.raw !== undefined, get: () => state.raw },
  }));
  vi.doMock('@rosen-bridge/minimum-fee', async () => {
    const { pinnedFeeDependencies } = await import(
      '../fixtures/pinnedFeeDependencies'
    );
    const deps = pinnedFeeDependencies();
    class TestBox extends deps.fees.MinimumFeeBox {
      fetchBox = async () => {
        this.box =
          this.tokenId === 'cd'.repeat(32) ? state.extraBox : state.box;
        return !!this.box;
      };
    }
    return { ...deps.fees, MinimumFeeBox: TestBox };
  });
  vi.doMock('../../src/configs', () => ({
    kvRestApiUrl: 'https://synthetic-kv.invalid',
    kvRestApiToken: 'synthetic-fixture-token',
    get minimumFeeConfigs() {
      return state.fee;
    },
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
  vi.doMock('../../src/tokenMap/tokenHandler', () => ({
    TokenHandler: {
      getInstance: () => ({
        getSupportedTokens: () => Reflect.get(state.source as object, 'tokens'),
        getOriginalTokenMap: () =>
          Reflect.get(state.source as object, 'rawMap'),
        getTokenMap: () => ({
          getRawConfig: () =>
            Reflect.get(state.source as object, 'currentRawMap'),
        }),
      }),
    },
  }));
  vi.doMock('../../src/network/avalancheFeeRuntime', () => ({
    AvalancheFeeRuntime: class {
      collectPlan = async (input: {
        assets: { selectedTokenId: string; common: object }[];
      }) =>
        (state.plan = {
          finalized: {
            chainId: BigInt(Reflect.get(state.raw as object, 'chainId')),
            height: 100,
            hash: '0x' + '01'.repeat(32),
          },
          quote: {
            chainId: BigInt(Reflect.get(state.raw as object, 'chainId')),
            baseFeePerGas: 16n,
            maxPriorityFeePerGas: 1n,
            maxFeePerGas: 33n,
          },
          assets: input.assets.map((asset) => ({
            ...asset,
            ergoTokenId: 'ab'.repeat(32),
            activationHeight:
              100 + Number(Reflect.get(state.raw as object, 'activationDelay')),
            fee: { ...asset.common, networkFee: 33000000000n },
          })),
        });
    },
  }));
  vi.doMock('../../src/network/clients', () => ({
    getBitcoinFeeRatio: async () => {
      state.generationHook?.();
      return { '1': 1 };
    },
    getAddressBoxes: async () => {
      state.calls.push('address');
      await state.hook?.('address');
      return state.funding;
    },
    getErgoHeight: async () => {
      state.calls.push('height');
      await state.hook?.('height');
      return 100;
    },
    getStateContext: async () => {
      state.calls.push('context');
      await state.hook?.('context');
      return state.context;
    },
  }));
  vi.doMock('@rosen-bridge/ergo-box-selection', async (importOriginal) => {
    const actual =
      await importOriginal<typeof import('@rosen-bridge/ergo-box-selection')>();
    class TrackingSelection extends actual.ErgoBoxSelection {
      constructor(
        ...args: ConstructorParameters<typeof actual.ErgoBoxSelection>
      ) {
        super(...args);
        const get = this.getCoveringBoxes;
        this.getCoveringBoxes = async (...args) => {
          state.calls.push('cover');
          await state.hook?.('cover');
          return await get(...args);
        };
      }
    }
    return { ...actual, ErgoBoxSelection: TrackingSelection };
  });
};
