import { pinnedFeeDependencies } from '../fixtures/pinnedFeeDependencies';
import {
  state,
  installConstructionMocks,
} from '../mocked/avalancheFeeConstruction.mock';
import { nft, native } from '../testData/avalancheFeeConstruction';

/** Integrity-qualified producer dependencies used by construction fixtures. */
export let deps: ReturnType<typeof pinnedFeeDependencies>;
/** Builds a fresh common fee policy. */
export const common = () => ({
  bridgeFee: 100n,
  networkFee: 1n,
  rsnRatio: 1n,
  rsnRatioDivisor: 1n,
  feeRatio: 1n,
});
/** Builds fresh activation frontiers for the legacy chains. */
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
/** Reads the mutable fee policy controlled by a scenario. */
export const feePolicy = () =>
  state.fee as {
    minimumFeeNFT: string;
    minimumFeeAddress: string;
    feeAddress: string;
    minBoxErg: bigint;
    txFee: bigint;
  };
/** Builds an authenticated update using real fee producers and the economic-plan fixture. */
export const setup = async () => {
  const api = await import('../../src/minimum-fee/avalancheFeeIntegration');
  const generation = api.beginAvalancheFeeGeneration(
    () => state.source as never,
  );
  const candidate = new deps.fees.MinimumFeeConfig().setChainConfig(
    'ergo',
    105,
    common(),
  );
  const candidates = new Map([['avax', candidate]]),
    frontier = heights();
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
/** Derives generator orders and inputs from a real construction permit. */
export const direct = async () => {
  const setupResult = await setup();
  const { api, updated } = setupResult;
  const permit = api.consumeAvalancheUpdatedConfigs(updated)!;
  const { policy } = permit;
  const order = permit.entries.map((entry) => ({
    address: policy.minimumFeeAddress,
    assets: {
      nativeToken: policy.minBoxErg,
      tokens: [
        { id: policy.minimumFeeNFT, value: 1n },
        ...(entry.tokenId === 'erg'
          ? []
          : [{ id: entry.ergoTokenId, value: 1n }]),
      ],
    },
    box: api.cloneAvalancheCandidate(entry.candidate, policy.minBoxErg),
  }));
  const inputs = permit.entries.flatMap((entry) =>
    entry.current
      ? [
          deps.wasm.ErgoBox.sigma_parse_bytes(
            Buffer.from(entry.current, 'base64'),
          ),
        ]
      : [],
  );
  const { generateTransaction } = await import(
    '../../src/transaction/generate'
  );
  return { ...setupResult, permit, order, inputs, generateTransaction };
};
/** Generates every asynchronous phase and caller-owned field pair. */
export const constructionCases8 = [
  'address',
  'cover',
  'height',
  'context',
].flatMap((phase) =>
  ['assets', 'output', 'inputs'].map((field) => ({ phase, field })),
);

/** Registers the construction fixture before its source-target tests run. */
export const registerConstructionContext = () => {
  beforeEach(() => {
    vi.doUnmock('@rosen-bridge/tokens');
    installConstructionMocks();
  });
  beforeAll(() => {
    deps = pinnedFeeDependencies();
  });
  beforeEach(async () => {
    vi.resetModules();
    state.hook = undefined;
    state.calls = [];
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
  afterEach(() => vi.restoreAllMocks());
};
