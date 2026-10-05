import { createHash } from 'node:crypto';

import { decodeAvalanchePublication } from '../../../frontend/src/avalanche/publication';
import { inspectAvalancheFeeStructure } from '../../../frontend/src/avalanche/validation';
import { pinnedFeeDependencies } from '../fixtures/pinnedFeeDependencies';

const state = vi.hoisted(() => ({
  raw: undefined as unknown,
  fee: undefined as unknown,
  source: undefined as unknown,
  box: undefined as unknown,
  funding: [] as unknown[],
  context: undefined as unknown,
  hook: undefined as undefined | ((phase: string) => Promise<void>),
  calls: [] as string[],
  legacyPrices: new Map<string, number>(),
  generationHook: undefined as undefined | (() => void),
}));
vi.mock('config', () => ({
  default: { has: () => state.raw !== undefined, get: () => state.raw },
}));
vi.mock('@rosen-bridge/minimum-fee', async () => {
  const { pinnedFeeDependencies } = await import(
    '../fixtures/pinnedFeeDependencies'
  );
  const deps = pinnedFeeDependencies();
  class TestBox extends deps.fees.MinimumFeeBox {
    fetchBox = async () => {
      this.box = state.box;
      return !!this.box;
    };
  }
  return { ...deps.fees, MinimumFeeBox: TestBox };
});
vi.mock('../../src/configs', () => ({
  ERG: 'erg',
  ADA: 'ada',
  BTC: 'btc',
  ETH: 'eth',
  BNB: 'bnb',
  DOGE: 'doge',
  FIRO: 'firo',
  HNS: 'hns',
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
vi.mock('../../src/tokenMap/tokenHandler', () => ({
  TokenHandler: {
    getInstance: () => ({
      getSupportedTokens: () => Reflect.get(state.source as object, 'tokens'),
      getOriginalTokenMap: () => Reflect.get(state.source as object, 'rawMap'),
      getTokenMap: () => ({
        getConfig: () => Reflect.get(state.source as object, 'currentRawMap'),
        getRawConfig: () =>
          Reflect.get(state.source as object, 'currentRawMap'),
      }),
    }),
  },
}));
vi.mock('../../src/network/avalancheFeeRuntime', () => ({
  AvalancheFeeRuntime: class {
    collectPlan = async (input: {
      assets: { selectedTokenId: string; common: object }[];
    }) => ({
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
vi.mock('../../src/network/clients', () => ({
  getBitcoinFeeRatio: async () => {
    state.generationHook?.();
    return { '1': 1 };
  },
  getDogeFeeRatio: async () => 1,
  getFiroFeeRatio: async () => 1,
  getHandshakeFeeRatio: async () => 1,
  getEthereumFeeHistory: async () => ({ baseFeePerGas: ['1'] }),
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
vi.mock('@rosen-bridge/ergo-box-selection', async (importOriginal) => {
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
let deps: ReturnType<typeof pinnedFeeDependencies>;
const nft = '12'.repeat(32),
  native = 'ab'.repeat(32);
const common = () => ({
  bridgeFee: 100n,
  networkFee: 1n,
  rsnRatio: 1n,
  rsnRatioDivisor: 1n,
  feeRatio: 1n,
});
const heights = () =>
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
beforeAll(() => {
  deps = pinnedFeeDependencies();
});
beforeEach(async () => {
  vi.resetModules();
  state.hook = undefined;
  state.calls = [];
  state.generationHook = undefined;
  state.legacyPrices = new Map([
    ['avax', 2],
    ['erg', 1],
  ]);
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
  const fundingAddress = deps.wasm.Address.from_public_key(
    Buffer.from(
      '02c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5',
      'hex',
    ),
  ).to_base58(0);
  state.fee = {
    RSNTokenId: 'avax',
    minimumFeeNFT: nft,
    minimumFeeAddress: address,
    feeAddress: fundingAddress,
    rsnRatioPrecision: 6,
    ethereumNetworkFeeMultiplier: 1,
    ethereumAvgGasPricePeriod: 1,
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
        fee: {
          bridgeFeeUSD: 1,
          feeRatioFloat: 0.01,
          ergNetworkFee: 0.001,
          delays: Object.fromEntries(
            [...heights().keys()].map((chain) => [chain, 5]),
          ),
        },
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
      deps.wasm.Address.from_base58(fundingAddress).to_ergo_tree(),
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

const contract = (chain: 43113 | 43114 = 43113) => ({
  expectedChainId: chain,
  minimumFeeAddress: Reflect.get(
    state.fee as object,
    'minimumFeeAddress',
  ) as string,
  minimumFeeNFT: nft,
});
const prepare = async () => {
  const { generateNewFeeConfig } = await import(
    '../../src/minimum-fee/newConfig'
  );
  const frontier = heights();
  const candidates = await generateNewFeeConfig(state.legacyPrices, frontier);
  const { updateAndGenerateFeeConfig } = await import(
    '../../src/minimum-fee/updateConfig'
  );
  return (await updateAndGenerateFeeConfig(candidates, frontier)).config;
};
const publish = async (empty = false) => {
  const updated = await prepare();
  const { updateConfigsTransaction } = await import(
    '../../src/minimum-fee/transaction'
  );
  const { publishAvalancheFee } = await import(
    '../../src/minimum-fee/publication'
  );
  const candidate = empty ? updated : await updateConfigsTransaction(updated);
  let bytes = '';
  const envelope = await publishAvalancheFee(candidate, async (_key, value) => {
    bytes = value;
  });
  return { bytes, envelope };
};
const canonical = (value: unknown): string => {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object')
    return (
      '{' +
      Object.keys(value)
        .sort()
        .map(
          (key) =>
            JSON.stringify(key) + ':' + canonical(Reflect.get(value, key)),
        )
        .join(',') +
      '}'
    );
  return JSON.stringify(value);
};
const reseal = (value: object) => {
  const body = { ...value };
  Reflect.deleteProperty(body, 'publicationId');
  return {
    ...body,
    publicationId: createHash('sha256').update(canonical(body)).digest('hex'),
  };
};
describe('publishAvalancheFee', () => {
  /**
   * @target publishAvalancheFee: actual producer bytes pass both consumers for chain %s and preserve consumed history
   * @dependencies Actual fee producer, canonical WASM transaction and independent frontend consumers with pinned dependency fixtures.
   * @scenario actual producer bytes pass both consumers for chain %s and preserve consumed history; vary only the declared case parameters against the shared producer fixture.
   * @expected actual producer bytes pass both consumers for chain %s and preserve consumed history. Invalid cases refuse the isolated fault; positive cases retain the declared exact transaction and publication checks.
   */
  it.each([43113, 43114] as const)(
    'actual producer bytes pass both consumers for chain %s and preserve consumed history',
    async (chain) => {
      Reflect.set(state.raw as object, 'chainId', chain);
      const { bytes, envelope } = await publish();
      const decoded = decodeAvalanchePublication(bytes, chain);
      expect(decoded.version).toBe(2);
      if (decoded.version !== 2) throw new Error('Expected V2 producer');
      expect(decoded.feeEvidence.finalized.chainId).toBe(chain);
      expect(decoded.feeEvidence.quote.chainId).toBe(chain);
      expect(
        decoded.feeEvidence.updates[0].candidate.configs.avalanche,
      ).toEqual(decoded.feeEvidence.assets[0].fee);
      const report = inspectAvalancheFeeStructure(decoded, contract(chain));
      expect(report.scope).toBe('transaction-structure-only');
      expect(report.publicationId).toBe(envelope.publicationId);
      expect(report.feeInputs).toHaveLength(1);
      expect(report.feeOutputs).toHaveLength(1);
      expect(report.feeInputs[0].tokenId).toBe(native);
      expect(report.feeOutputs[0].fees[0]).toEqual(report.feeInputs[0].fees[0]);
      expect(
        report.feeOutputs[0].fees.at(-1)!.configs.avalanche.networkFee,
      ).toBe('33000000000');
      expect(report.feeOutputs[0].fees.at(-1)!.heights.avalanche).toBe(105);
      expect(report.feeInputs[0].serialized).toBe(
        Buffer.from(
          (
            state.box as InstanceType<typeof deps.wasm.ErgoBox>
          ).sigma_serialize_bytes(),
        ).toString('base64'),
      );
      const reduced = deps.wasm.ReducedTransaction.sigma_parse_bytes(
        Buffer.from(decoded.transaction!.reducedTx, 'base64'),
      );
      expect(report.transactionId).toBe(reduced.unsigned_tx().id().to_str());
      expect(decoded.transaction!.sender).not.toBe(
        contract().minimumFeeAddress,
      );
      expect(Object.isFrozen(report.feeOutputs[0].fees)).toBe(true);
      expect(report).not.toHaveProperty('eligibleForSigning');
    },
  );

  /**
   * @target publishAvalancheFee: genuine no-change generation publishes an explicit empty result on %s
   * @dependencies Actual fee producer, canonical WASM transaction and independent frontend consumers with pinned dependency fixtures.
   * @scenario genuine no-change generation publishes an explicit empty result on %s; vary only the declared case parameters against the shared producer fixture.
   * @expected genuine no-change generation publishes an explicit empty result on %s. Invalid cases refuse the isolated fault; positive cases retain the declared exact transaction and publication checks.
   */
  it.each([43113, 43114] as const)(
    'genuine no-change generation publishes an explicit empty result on %s',
    async (chain) => {
      Reflect.set(state.raw as object, 'chainId', chain);
      const previous = await prepare();
      const oldBuilder = previous.get('avax')!.new;
      // Make the next fetch contain the exact proposed fee values, now active.
      const current = oldBuilder.getConfigs().at(-1)!;
      current.heights = Object.fromEntries(
        Object.keys(current.heights).map((chain) => [chain, 1]),
      );
      const builder = new deps.fees.MinimumFeeBoxBuilder(
        nft,
        contract().minimumFeeAddress,
      )
        .setHeight(1)
        .setToken(native)
        .setValue(1000000n)
        .addConfig(new deps.fees.MinimumFeeConfig(current));
      state.box = deps.wasm.ErgoBox.from_box_candidate(
        builder.build(),
        deps.wasm.TxId.zero(),
        3,
      );
      const { bytes } = await publish(true);
      const decoded = decodeAvalanchePublication(bytes, chain);
      expect(decoded.kind).toBe('empty');
      if (decoded.version !== 2) throw new Error('Expected V2 producer');
      expect(decoded.feeEvidence.updates).toEqual([]);
      expect(decoded.feeEvidence.assets).toHaveLength(1);
      expect(
        inspectAvalancheFeeStructure(bytes, contract(chain)),
      ).toMatchObject({
        kind: 'empty',
        transactionId: null,
        feeInputs: [],
        feeOutputs: [],
      });
    },
  );
});

describe('inspectAvalancheFeeStructure', () => {
  /**
   * @target inspectAvalancheFeeStructure: rejects opposite deployment chain for producer chain %s
   * @dependencies Actual fee producer, canonical WASM transaction and independent frontend consumers with pinned dependency fixtures.
   * @scenario rejects opposite deployment chain for producer chain %s; vary only the declared case parameters against the shared producer fixture.
   * @expected rejects opposite deployment chain for producer chain %s. Invalid cases refuse the isolated fault; positive cases retain the declared exact transaction and publication checks.
   */
  it.each([43113, 43114] as const)(
    'rejects opposite deployment chain for producer chain %s',
    async (chain) => {
      Reflect.set(state.raw as object, 'chainId', chain);
      const { bytes } = await publish();
      expect(() =>
        inspectAvalancheFeeStructure(
          bytes,
          contract(chain === 43113 ? 43114 : 43113),
        ),
      ).toThrow();
    },
  );

  /**
   * @target inspectAvalancheFeeStructure: rejects single-fault %s after actual producer publication
   * @dependencies Actual fee producer, canonical WASM transaction and independent frontend consumers with pinned dependency fixtures.
   * @scenario rejects single-fault %s after actual producer publication; vary only the declared case parameters against the shared producer fixture.
   * @expected rejects single-fault %s after actual producer publication. Invalid cases refuse the isolated fault; positive cases retain the declared exact transaction and publication checks.
   */
  it.each([
    'reduced suffix',
    'box suffix',
    'input order',
    'extra auxiliary',
    'digest',
    'target metadata',
  ] as const)(
    'rejects single-fault %s after actual producer publication',
    async (fault) => {
      const { bytes } = await publish();
      const value = JSON.parse(bytes);
      if (fault === 'reduced suffix')
        value.transaction.reducedTx = Buffer.concat([
          Buffer.from(value.transaction.reducedTx, 'base64'),
          Buffer.from([0]),
        ]).toString('base64');
      if (fault === 'box suffix')
        value.transaction.inputs[0] = Buffer.concat([
          Buffer.from(value.transaction.inputs[0], 'base64'),
          Buffer.from([0]),
        ]).toString('base64');
      if (fault === 'input order') value.transaction.inputs.reverse();
      if (fault === 'extra auxiliary') value.transaction.dataInputs = [];
      if (fault === 'target metadata') {
        value.supportedTokens[0].ergoSideTokenId = 'cd'.repeat(32);
        value.rawTokenMap[0].ergo.tokenId = 'cd'.repeat(32);
      }
      const packet = reseal(value);
      if (fault === 'digest')
        Reflect.set(packet, 'publicationId', '0'.repeat(64));
      expect(() => inspectAvalancheFeeStructure(packet, contract())).toThrow();
    },
  );
  /** Deliberately corrupted packets are newly reduced, canonical WASM and re-digested.
   * These fixtures demonstrate structural rejection, never publisher authentication. */

  /**
   * @target inspectAvalancheFeeStructure: rejects canonical re-encoded %s in generated transaction
   * @dependencies Actual fee producer, canonical WASM transaction and independent frontend consumers with pinned dependency fixtures.
   * @scenario rejects canonical re-encoded %s in generated transaction; vary only the declared case parameters against the shared producer fixture.
   * @expected rejects canonical re-encoded %s in generated transaction. Invalid cases refuse the isolated fault; positive cases retain the declared exact transaction and publication checks.
   */
  it.each([
    'register type',
    'register extra column',
    'NFT',
    'target',
    'data input',
  ] as const)(
    'rejects canonical re-encoded %s in generated transaction',
    async (fault) => {
      const { bytes } = await publish();
      const value = JSON.parse(bytes);
      const wasm = deps.wasm;
      const reduced = wasm.ReducedTransaction.sigma_parse_bytes(
        Buffer.from(value.transaction.reducedTx, 'base64'),
      );
      const unsigned = reduced.unsigned_tx();
      const outputs = unsigned.output_candidates(),
        changed = wasm.ErgoBoxCandidates.empty();
      let touched = false;
      for (let i = 0; i < outputs.len(); i++) {
        const output = outputs.get(i);
        const box = wasm.ErgoBox.from_box_candidate(
          output,
          wasm.TxId.zero(),
          i,
        );
        if (
          !touched &&
          Buffer.from(box.ergo_tree().sigma_serialize_bytes()).equals(
            Buffer.from(
              wasm.Address.from_base58(contract().minimumFeeAddress)
                .to_ergo_tree()
                .sigma_serialize_bytes(),
            ),
          )
        ) {
          touched = true;
          const json = box.to_js_eip12();
          if (fault === 'register type')
            json.additionalRegisters.R5 =
              wasm.Constant.from_i32(1).encode_to_base16();
          if (fault === 'register extra column') {
            const rows = box.register_value(7)!.to_js() as string[][];
            rows[0].push('99');
            json.additionalRegisters.R7 =
              wasm.Constant.from_js(rows).encode_to_base16();
          }
          if (fault === 'NFT') json.assets[0].tokenId = 'ff'.repeat(32);
          if (fault === 'target') json.assets[1].tokenId = 'cd'.repeat(32);
          delete json.boxId;
          const mutated = wasm.ErgoBox.from_json(JSON.stringify(json));
          const builder = new wasm.ErgoBoxCandidateBuilder(
            mutated.value(),
            wasm.Contract.new(mutated.ergo_tree()),
            mutated.creation_height(),
          );
          for (let n = 0; n < mutated.tokens().len(); n++)
            builder.add_token(
              mutated.tokens().get(n).id(),
              mutated.tokens().get(n).amount(),
            );
          for (let n = 4; n <= 9; n++)
            if (mutated.register_value(n))
              builder.set_register_value(n, mutated.register_value(n)!);
          changed.add(builder.build());
        } else changed.add(output);
      }
      expect(touched).toBe(true);
      const inputs = wasm.ErgoBoxes.empty();
      value.transaction.inputs.forEach((input: string) =>
        inputs.add(
          wasm.ErgoBox.sigma_parse_bytes(Buffer.from(input, 'base64')),
        ),
      );
      const dataBoxes = wasm.ErgoBoxes.empty(),
        dataInputs = new wasm.DataInputs();
      if (fault === 'data input') {
        const data = wasm.ErgoBox.from_box_candidate(
          outputs.get(0),
          wasm.TxId.zero(),
          99,
        );
        dataBoxes.add(data);
        dataInputs.add(new wasm.DataInput(data.box_id()));
      }
      const changedUnsigned = new wasm.UnsignedTransaction(
        unsigned.inputs(),
        dataInputs,
        changed,
      );
      const changedReduced = wasm.ReducedTransaction.from_unsigned_tx(
        changedUnsigned,
        inputs,
        dataBoxes,
        state.context as InstanceType<typeof wasm.ErgoStateContext>,
      );
      value.transaction.reducedTx = Buffer.from(
        changedReduced.sigma_serialize_bytes(),
      ).toString('base64');
      expect(() =>
        inspectAvalancheFeeStructure(reseal(value), contract()),
      ).toThrow();
    },
  );
});
