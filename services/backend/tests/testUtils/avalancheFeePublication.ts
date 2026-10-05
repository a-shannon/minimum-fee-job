import { pinnedFeeDependencies } from '../fixtures/pinnedFeeDependencies';
import {
  state,
  installPublicationMocks,
} from '../mocked/avalancheFeePublication.mock';
import { nft, native } from '../testData/avalancheFeePublication';

export let deps: ReturnType<typeof pinnedFeeDependencies>;
/** Builds fresh exact common fee fields retained by native and legacy candidates. */
export const common = () => ({
  bridgeFee: 100n,
  networkFee: 1n,
  rsnRatio: 1n,
  rsnRatioDivisor: 1n,
  feeRatio: 1n,
});
/** Builds the original ordered legacy chain frontier at synthetic height100. */
export const heights = () =>
  new Map(
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
    ].map((chain) => [chain, 100]),
  );
/** Creates an actual generation binding and updated candidates using the original injected plan, pinned fee classes and real construction functions. */
export const setup = async (
  heightOnlyChain = false,
  legacyCandidate = false,
) => {
  if (legacyCandidate) {
    const source = state.source as {
      tokens: object[];
      rawMap: object[];
      currentRawMap: object[];
    };
    source.tokens.push({
      tokenId: 'legacy',
      ergoSideTokenId: 'cd'.repeat(32),
      decimals: 6,
      name: 'Legacy token',
      fee: {},
    });
    source.rawMap.push({
      ergo: { tokenId: 'cd'.repeat(32), decimals: 9 },
      cardano: { tokenId: 'legacy', decimals: 6 },
    });
    source.currentRawMap = structuredClone(source.rawMap);
    const old = new deps.fees.MinimumFeeBoxBuilder(
      nft,
      Reflect.get(state.fee as object, 'minimumFeeAddress'),
    )
      .setHeight(1)
      .setToken('cd'.repeat(32))
      .setValue(1000000n)
      .addConfig(
        new deps.fees.MinimumFeeConfig().setChainConfig('ergo', 1, common()),
      );
    state.extraBox = deps.wasm.ErgoBox.from_box_candidate(
      old.build(),
      deps.wasm.TxId.zero(),
      4,
    );
  }
  const api = await import('../../src/minimum-fee/avalancheFeeIntegration');
  const generation = api.beginAvalancheFeeGeneration(
    () => state.source as never,
    () => ({
      legacyNumericPrices: Array.from(state.legacyPrices),
      rsnTokenId: Reflect.get(state.fee as object, 'RSNTokenId'),
    }),
  );
  const candidate = new deps.fees.MinimumFeeConfig().setChainConfig(
    'ergo',
    105,
    common(),
  );
  const candidates = new Map([['avax', candidate]]),
    frontier = heights();
  if (heightOnlyChain) candidate.setChainConfig('cardano', 105, undefined);
  if (legacyCandidate)
    candidates.set(
      'legacy',
      new deps.fees.MinimumFeeConfig().setChainConfig('ergo', 105, {
        ...common(),
        networkFee: 10000n,
      }),
    );
  await api.finishAvalancheFeeGeneration(generation, candidates, frontier);
  const { updateAndGenerateFeeConfig } = await import(
    '../../src/minimum-fee/updateConfig'
  );
  const result = await updateAndGenerateFeeConfig(candidates, frontier);
  const { updateConfigsTransaction } = await import(
    '../../src/minimum-fee/transaction'
  );
  return {
    api,
    updated: result.config,
    updateConfigsTransaction,
    candidates,
    frontier,
  };
};
/** Registers the original fixture initialization and cleanup only inside this publication authority context. */
export const registerPublicationContext = () => {
  beforeAll(() => {
    deps = pinnedFeeDependencies();
  });
  beforeEach(async () => {
    for (const name of [
      'config',
      '@rosen-bridge/minimum-fee',
      '../../src/configs',
      '../../src/tokenMap/tokenHandler',
      '../../src/network/avalancheFeeRuntime',
      '../../src/network/clients',
      '@rosen-bridge/ergo-box-selection',
      '@rosen-bridge/tokens',
    ])
      vi.doUnmock(name);
    installPublicationMocks();
    vi.resetModules();
    state.hook = undefined;
    state.calls = [];
    state.generationHook = undefined;
    state.extraBox = undefined;
    state.legacyPrices = new Map([['avax', 2.0000000000000004]]);
    const { DefaultLogger, DummyLogger } = await import(
      '@rosen-bridge/abstract-logger'
    );
    DefaultLogger.init(new DummyLogger());
    const address = deps.wasm.Address.from_public_key(
      Buffer.from(
        '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798',
        'hex',
      ),
    ).to_base58(0);
    state.fee = {
      RSNTokenId: 'avax',
      minimumFeeNFT: nft,
      minimumFeeAddress: address,
      feeAddress: address,
      minBoxErg: 1000000n,
      txFee: 1000000n,
      fetchBoxRetry: 1,
    };
    state.raw = {
      enabled: true,
      chainId: 43113,
      rpcUrl: 'https://fixture.invalid',
      requestTimeoutMs: 1000,
      gasBudget: '1000000000000000000',
      margin: { numerator: '1', denominator: '1' },
      activationDelay: 5,
      avaxPrice: '2',
      tokenPrices: { avax: '2' },
      feeGuaranteeBlocks: 10,
      networkFeeTriggerPercent: '5',
    };
    const rawMap = [
      {
        avalanche: {
          tokenId: 'avax',
          type: 'native',
          residency: 'native',
          decimals: 18,
        },
        ergo: {
          tokenId: native,
          decimals: 9,
          type: 'EIP-004',
          residency: 'wrapped',
        },
      },
    ];
    state.source = {
      tokens: [
        {
          tokenId: 'avax',
          ergoSideTokenId: native,
          decimals: 9,
          name: 'AVAX',
          fee: {},
        },
      ],
      rawMap,
      currentRawMap: structuredClone(rawMap),
    };
    const old = new deps.fees.MinimumFeeBoxBuilder(nft, address)
      .setHeight(1)
      .setToken(native)
      .setValue(1000000n)
      .addConfig(
        new deps.fees.MinimumFeeConfig()
          .setChainConfig('ergo', 1, common())
          .setChainConfig('avalanche', 1, common()),
      );
    state.box = deps.wasm.ErgoBox.from_box_candidate(
      old.build(),
      deps.wasm.TxId.zero(),
      1,
    );
    const fundingBuilder = new deps.wasm.ErgoBoxCandidateBuilder(
      deps.wasm.BoxValue.from_i64(deps.wasm.I64.from_str('100000000')),
      deps.wasm.Contract.new(
        deps.wasm.Address.from_base58(address).to_ergo_tree(),
      ),
      1,
    );
    state.funding = [
      deps.wasm.ErgoBox.from_box_candidate(
        fundingBuilder.build(),
        deps.wasm.TxId.zero(),
        2,
      ),
    ];
    // Synthetic header shape matches the pinned Ergo chain fixture; no network or proof claim.
    const zero = '0'.repeat(64),
      headers = deps.wasm.BlockHeaders.from_json(
        Array(10).fill({
          extensionId: zero,
          difficulty: '5275058176',
          votes: '000000',
          timestamp: 0,
          size: 220,
          stateRoot: '0'.repeat(66),
          height: 100,
          nBits: 0,
          version: 2,
          id: zero,
          adProofsRoot: zero,
          transactionsRoot: zero,
          extensionHash: zero,
          powSolutions: {
            pk: '03702266cae8daf75b7f09d4c23ad9cdc954849ee280eefae0d67bd97db4a68f6a',
            w: '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798',
            n: '000000019cdfb631',
            d: 0,
          },
          adProofsId: zero,
          transactionsId: zero,
          parentId: zero,
        }),
      );
    state.context = new deps.wasm.ErgoStateContext(
      deps.wasm.PreHeader.from_block_header(headers.get(0)),
      headers,
    );
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
};
