import { createHash } from 'node:crypto';
import fs from 'node:fs';

import {
  inspectAvalancheFeeEconomics,
  TrustedAvalancheFeePolicy,
  TrustedAvalancheFeeObservations,
} from '../../../frontend/src/avalanche/economics';
import { AvalanchePublicationV2 } from '../../../frontend/src/avalanche/publication';
import { inspectAvalancheFeeStructure } from '../../../frontend/src/avalanche/validation';
import { pinnedFeeDependencies } from '../fixtures/pinnedFeeDependencies';

const state = vi.hoisted(() => ({
  raw: undefined as unknown,
  fee: undefined as unknown,
  source: undefined as unknown,
  boxes: new Map<string, unknown>(),
  funding: [] as unknown[],
  context: undefined as unknown,
  rpc: [] as string[],
  chains: [
    'ergo',
    'cardano',
    'bitcoin',
    'ethereum',
    'binance',
    'doge',
    'bitcoin-runes',
    'firo',
    'handshake',
  ],
}));
vi.mock('config', () => ({
  default: { has: () => true, get: () => state.raw },
}));
vi.mock('../../src/configs', () => ({
  get minimumFeeConfigs() {
    return state.fee;
  },
  bridgeFeeTriggerPercent: 5,
  rsnRatioTriggerPercent: 5,
  networkFeeTriggerPercent: Object.fromEntries(
    state.chains.map((chain) => [chain, 5]),
  ),
  feeGuaranteeDuration: new Map(state.chains.map((chain) => [chain, 10])),
  urls: { ergoExplorer: 'https://synthetic.invalid' },
}));
vi.mock('@rosen-bridge/minimum-fee', async () => {
  const { pinnedFeeDependencies } = await import(
    '../fixtures/pinnedFeeDependencies'
  );
  const deps = pinnedFeeDependencies();
  class FixtureBox extends deps.fees.MinimumFeeBox {
    fetchBox = async () => {
      this.box = state.boxes.get(this.tokenId);
      return !!this.box;
    };
  }
  return { ...deps.fees, MinimumFeeBox: FixtureBox };
});
vi.mock('../../src/tokenMap/tokenHandler', () => ({
  TokenHandler: {
    getInstance: () => ({
      getSupportedTokens: () => Reflect.get(state.source as object, 'tokens'),
    }),
  },
}));
vi.mock('../../src/network/clients', () => ({
  getAddressBoxes: async () => state.funding,
  getErgoHeight: async () => 100,
  getStateContext: async () => state.context,
}));
// Keep the actual runtime, input capture, RPC parser, plan and integer math.
// Only its transport is replaced; this fixture cannot contact a network.
vi.mock('../../src/network/avalancheFeeRuntime', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('../../src/network/avalancheFeeRuntime')
    >();
  return {
    AvalancheFeeRuntime: class extends actual.AvalancheFeeRuntime {
      constructor(raw: unknown) {
        super(raw, (_request, chainId) => ({
          send: async (method, params) => {
            state.rpc.push(method);
            if (method === 'eth_chainId') return '0x' + chainId.toString(16);
            if (method === 'eth_getBlockByNumber') {
              expect(params).toEqual(['finalized', false]);
              return { number: '0x64', hash: '0x' + '01'.repeat(32) };
            }
            if (method === 'eth_baseFee') return '0x10';
            if (method === 'eth_maxPriorityFeePerGas') return '0x1';
            throw new Error('Unexpected synthetic RPC method');
          },
        }));
      }
    },
  };
});

let deps: ReturnType<typeof pinnedFeeDependencies>;
const nft = '12'.repeat(32),
  native = 'ab'.repeat(32),
  erc = 'cd'.repeat(32),
  legacy = 'ef'.repeat(32);
const contractToken = '0x' + '34'.repeat(20);
const common = {
  bridgeFee: '100',
  rsnRatio: '2',
  rsnRatioDivisor: '3',
  feeRatio: '4',
};
const chainFee = (networkFee = 1n) => ({
  bridgeFee: 100n,
  networkFee,
  rsnRatio: 2n,
  rsnRatioDivisor: 3n,
  feeRatio: 4n,
});
beforeAll(() => {
  deps = pinnedFeeDependencies();
});
beforeEach(async () => {
  vi.resetModules();
  state.boxes = new Map();
  state.rpc = [];
  const { DefaultLogger, DummyLogger } = await import(
    '@rosen-bridge/abstract-logger'
  );
  DefaultLogger.init(new DummyLogger());
});
afterEach(() => {
  vi.restoreAllMocks();
});

const setup = async (
  chainId: 43113 | 43114 = 43113,
  existing = true,
  mixed = false,
  history:
    | 'plain'
    | 'retained cardano'
    | 'avalanche equality'
    | 'legacy equality' = 'plain',
  generatedMap?: AvalanchePublicationV2['rawTokenMap'],
) => {
  const w = deps.wasm;
  const address = w.Address.from_public_key(
    Buffer.from(
      '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798',
      'hex',
    ),
  ).to_base58(0);
  const fundingAddress = w.Address.from_public_key(
    Buffer.from(
      '02c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5',
      'hex',
    ),
  ).to_base58(0);
  const rawMap: AvalanchePublicationV2['rawTokenMap'] = generatedMap
    ? structuredClone(generatedMap)
    : [
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
        {
          avalanche: {
            tokenId: contractToken,
            type: 'ERC-20',
            residency: 'native',
            decimals: 18,
          },
          ergo: {
            tokenId: erc,
            decimals: 9,
            type: 'EIP-004',
            residency: 'wrapped',
          },
          cardano: { tokenId: 'erc-cardano', decimals: 6 },
        },
        ...(mixed
          ? [
              {
                ergo: { tokenId: legacy, decimals: 9 },
                cardano: { tokenId: 'legacy', decimals: 6 },
              },
            ]
          : []),
      ];
  const selected = [
    ...rawMap
      .filter((set) => set.avalanche)
      .map((set) => ({
        id: String(set.avalanche.tokenId),
        ergo: String(set.ergo.tokenId),
        decimals: Math.min(
          ...Object.values(set).map((member) => Number(member.decimals)),
        ),
      })),
    ...(mixed ? [{ id: 'legacy', ergo: legacy, decimals: 6 }] : []),
  ];
  const feeToken = selected.find((asset) => asset.id !== 'avax')!.id;
  // Independent fixture authority is chosen before generation; never copied from the packet.
  const policy: TrustedAvalancheFeePolicy = {
    contract: {
      expectedChainId: chainId,
      minimumFeeAddress: address,
      minimumFeeNFT: nft,
    },
    rawTokenMap: structuredClone(rawMap),
    selectedTokenIds: selected.map((asset) => asset.id),
    gasBudget: '1000000000000000001',
    margin: { numerator: '3', denominator: '2' },
    activationDelay: 5,
    history: {
      chains: [...state.chains, 'avalanche'],
      guarantees: Object.fromEntries(
        [...state.chains, 'avalanche'].map((chain) => [chain, 10]),
      ),
    },
    common: { avax: { ...common }, [feeToken]: { ...common } },
  };
  const priorFeeBoxes: Record<string, string | null> = {};
  const observations: TrustedAvalancheFeeObservations = {
    finalized: { chainId, height: 100, hash: '0x' + '01'.repeat(32) },
    quote: {
      chainId,
      baseFeePerGas: '16',
      maxPriorityFeePerGas: '1',
      maxFeePerGas: '33',
    },
    frontiers: Object.fromEntries(
      [...state.chains, 'avalanche'].map((chain) => [chain, 100]),
    ),
    prices: { avax: '2', tokens: { avax: '2', [feeToken]: '3' } },
    priorFeeBoxes,
  };
  state.raw = {
    enabled: true,
    chainId,
    rpcUrl: 'https://synthetic.invalid',
    requestTimeoutMs: 1000,
    gasBudget: policy.gasBudget,
    margin: structuredClone(policy.margin),
    activationDelay: policy.activationDelay,
    avaxPrice: '2',
    tokenPrices: { ...observations.prices.tokens },
    feeGuaranteeBlocks: 10,
    networkFeeTriggerPercent: '5',
  };
  state.fee = {
    RSNTokenId: 'avax',
    minimumFeeNFT: nft,
    minimumFeeAddress: address,
    feeAddress: fundingAddress,
    minBoxErg: 1000000n,
    txFee: 1000000n,
    fetchBoxRetry: 1,
  };
  state.source = {
    tokens: selected.map((asset) => ({
      tokenId: asset.id,
      ergoSideTokenId: asset.ergo,
      decimals: asset.decimals,
      name: asset.id,
      fee: {},
    })),
    rawMap,
    currentRawMap: structuredClone(rawMap),
  };
  for (const [index, asset] of selected.entries()) {
    if (existing) {
      const builder = new deps.fees.MinimumFeeBoxBuilder(nft, address)
        .setToken(asset.ergo)
        .setHeight(1)
        .setValue(1000000n);
      for (const height of [0, 1, 90, 95]) {
        const row = new deps.fees.MinimumFeeConfig().setChainConfig(
          'ergo',
          height,
          chainFee(),
        );
        if (asset.id !== 'legacy')
          row.setChainConfig('avalanche', height, chainFee());
        if (history === 'retained cardano')
          row.setChainConfig('cardano', height, chainFee());
        if (height === 95 && history.includes('equality')) {
          row.setChainConfig('avalanche', 100, chainFee());
          row.setChainConfig(
            'ergo',
            history === 'legacy equality' ? 100 : 101,
            chainFee(),
          );
        }
        builder.addConfig(row);
      }
      const box = w.ErgoBox.from_box_candidate(
        builder.build(),
        w.TxId.zero(),
        index + 1,
      );
      state.boxes.set(asset.ergo, box);
      if (asset.id !== 'legacy')
        priorFeeBoxes[asset.ergo] = Buffer.from(
          box.sigma_serialize_bytes(),
        ).toString('base64');
    } else if (asset.id !== 'legacy') priorFeeBoxes[asset.ergo] = null;
  }
  const funding = new w.ErgoBoxCandidateBuilder(
    w.BoxValue.from_i64(w.I64.from_str('100000000')),
    w.Contract.new(w.Address.from_base58(fundingAddress).to_ergo_tree()),
    1,
  );
  if (!existing) {
    funding.add_token(
      w.TokenId.from_str(nft),
      w.TokenAmount.from_i64(w.I64.from_str(String(selected.length))),
    );
    for (const asset of selected)
      funding.add_token(
        w.TokenId.from_str(asset.ergo),
        w.TokenAmount.from_i64(w.I64.from_str('1')),
      );
  }
  state.funding = [
    w.ErgoBox.from_box_candidate(funding.build(), w.TxId.zero(), 20),
  ];
  // Synthetic ten-header context, as in the accepted producer WASM fixture. No proof-validity claim.
  const zero = '0'.repeat(64);
  const headers = w.BlockHeaders.from_json(
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
  state.context = new w.ErgoStateContext(
    w.PreHeader.from_block_header(headers.get(0)),
    headers,
  );
  const api = await import('../../src/minimum-fee/avalancheFeeIntegration');
  const generation = api.beginAvalancheFeeGeneration(
    () => state.source as never,
    () => ({ legacyNumericPrices: [['avax', 2]], rsnTokenId: 'avax' }),
  );
  const candidates = new Map(
    selected.map((asset) => [
      asset.id,
      new deps.fees.MinimumFeeConfig()
        .setChainConfig('ergo', 105, chainFee(10000n))
        .setChainConfig('cardano', 105, undefined),
    ]),
  );
  const frontiers = new Map(state.chains.map((chain) => [chain, 100]));
  await api.finishAvalancheFeeGeneration(generation, candidates, frontiers);
  const { updateAndGenerateFeeConfig } = await import(
    '../../src/minimum-fee/updateConfig'
  );
  const updated = await updateAndGenerateFeeConfig(candidates, frontiers);
  const { updateConfigsTransaction } = await import(
    '../../src/minimum-fee/transaction'
  );
  const { publishAvalancheFee } = await import(
    '../../src/minimum-fee/publication'
  );
  const transaction = await updateConfigsTransaction(updated.config);
  let serialized = '';
  await publishAvalancheFee(transaction, async (_key, bytes) => {
    serialized = bytes;
  });
  return {
    publication: JSON.parse(serialized) as AvalanchePublicationV2,
    policy,
    observations,
  };
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
const reseal = (value: AvalanchePublicationV2) => {
  const body = { ...value };
  Reflect.deleteProperty(body, 'publicationId');
  return {
    ...body,
    publicationId: createHash('sha256').update(canonical(body)).digest('hex'),
  };
};
type Fixture = Awaited<ReturnType<typeof setup>>;
const replaceFeeOutput = (
  f: Fixture,
  edit: (rows: ReturnType<typeof deps.fees.extractFeeFromBox>) => void,
) => {
  const w = deps.wasm,
    tx = f.publication.transaction!;
  const reduced = w.ReducedTransaction.sigma_parse_bytes(
    Buffer.from(tx.reducedTx, 'base64'),
  );
  const unsigned = reduced.unsigned_tx(),
    outputs = unsigned.output_candidates(),
    changed = w.ErgoBoxCandidates.empty();
  let matched = 0;
  for (let i = 0; i < outputs.len(); i++) {
    const output = outputs.get(i),
      box = w.ErgoBox.from_box_candidate(output, w.TxId.zero(), i);
    if (
      box.tokens().len() === 2 &&
      box.tokens().get(1).id().to_str() === native
    ) {
      matched++;
      const fees = deps.fees.extractFeeFromBox(box);
      edit(fees);
      const registers = deps.fees.feeToRegisterValues(fees);
      const builder = new w.ErgoBoxCandidateBuilder(
        box.value(),
        w.Contract.new(box.ergo_tree()),
        box.creation_height(),
      );
      for (let n = 0; n < box.tokens().len(); n++)
        builder.add_token(
          box.tokens().get(n).id(),
          box.tokens().get(n).amount(),
        );
      for (let n = 4; n <= 9; n++)
        builder.set_register_value(n, registers['R' + n]);
      changed.add(builder.build());
    } else changed.add(output);
  }
  expect(matched).toBe(1);
  const inputs = w.ErgoBoxes.empty();
  for (const bytes of tx.inputs)
    inputs.add(w.ErgoBox.sigma_parse_bytes(Buffer.from(bytes, 'base64')));
  const mutated = new w.UnsignedTransaction(
    unsigned.inputs(),
    new w.DataInputs(),
    changed,
  );
  const replacement = w.ReducedTransaction.from_unsigned_tx(
    mutated,
    inputs,
    w.ErgoBoxes.empty(),
    state.context,
  );
  const result = structuredClone(f.publication);
  Reflect.set(
    result.transaction!,
    'reducedTx',
    Buffer.from(replacement.sigma_serialize_bytes()).toString('base64'),
  );
  return reseal(result);
};
describe('inspectAvalancheFeeEconomics', () => {
  /**
   * @target inspectAvalancheFeeEconomics: joins real runtime/producer and independent economics on %s
   * @dependencies Actual fee producer, canonical WASM transaction and independent frontend consumers with pinned dependency fixtures.
   * @scenario joins real runtime/producer and independent economics on %s; vary only the declared case parameters against the shared producer fixture.
   * @expected joins real runtime/producer and independent economics on %s. Invalid cases refuse the isolated fault; positive cases retain the declared exact transaction and publication checks.
   */
  it.each([43113, 43114] as const)(
    'joins real runtime/producer and independent economics on %s',
    async (chainId) => {
      for (const existing of [false, true])
        for (const mixed of [false, true]) {
          // Each generation uses the same explicit chain/runtime policy; newest binding wins.
          const f = await setup(chainId, existing, mixed);
          const report = inspectAvalancheFeeEconomics(
            f.publication,
            f.policy,
            f.observations,
          );
          expect(report.scope).toBe('published-avalanche-updates-only');
          expect(
            report.checkedUpdates.map((update) => ({
              selectedTokenId: update.selectedTokenId,
              ergoTokenId: update.ergoTokenId,
            })),
          ).toEqual([
            { selectedTokenId: 'avax', ergoTokenId: native },
            { selectedTokenId: contractToken, ergoTokenId: erc },
          ]);
          expect(report.structuralOnlyTargets).toEqual(mixed ? [legacy] : []);
          expect(
            f.publication.feeEvidence.assets.map(
              (asset) => asset.fee.networkFee,
            ),
          ).toEqual(['49500000001', '33000001']);
          expect(Object.isFrozen(report)).toBe(true);
          expect(report).not.toHaveProperty('eligibleForSigning');
          expect(report).not.toHaveProperty('valid');
        }
      expect(state.rpc).toContain('eth_baseFee');
    },
  );

  /**
   * @target inspectAvalancheFeeEconomics joins generated mainnet JOE 18/9 mapping
   * @dependencies Exact pinned contract-generator merged map, real backend runtime/WASM producer and frontend decoder/economics.
   * @scenario Generate an existing mainnet fee update with the full merged map and inspect its decoded amounts and selected counterpart.
   * @expected Official JOE contract and synthetic nine-decimal counterpart survive the actual consumer join with exact ceiling.
   */
  it('joins generated mainnet JOE 18/9 mapping', async () => {
    const bytes = fs.readFileSync(
      new URL('../testData/generatedAvalancheTokens.json', import.meta.url),
    );
    expect(createHash('sha256').update(bytes).digest('hex')).toEqual(
      '6c2106bfb0aef7b9f5c6ce5536338a59ece5b762b075d4c5b872cd9067ad7cfb',
    );
    const generated = JSON.parse(bytes.toString()) as {
      tokens: AvalanchePublicationV2['rawTokenMap'];
    };
    const f = await setup(43114, true, false, 'plain', generated.tokens);
    const report = inspectAvalancheFeeEconomics(
      f.publication,
      f.policy,
      f.observations,
    );
    const joe = report.checkedUpdates.find(
      (asset) =>
        asset.selectedTokenId === '0x6e84a6216ea6dacc71ee8e6b0a5b7322eebc0fdd',
    );
    expect(joe).toMatchObject({
      ergoTokenId: '0c'.repeat(32),
      activationHeight: 105,
      fee: { networkFee: '33000000001' },
    });
    expect(
      inspectAvalancheFeeStructure(f.publication, f.policy.contract)
        .feeOutputs.find((output) => output.tokenId === joe!.ergoTokenId)!
        .fees.at(-1)!.configs.avalanche.networkFee,
    ).toEqual('33000000001');
    expect(f.publication.rawTokenMap).toEqual(generated.tokens);
  });

  /**
   * @target inspectAvalancheFeeEconomics rejects isolated mapped policy fault %s
   * @dependencies Real producer publication, WASM structural decoder and separately captured map authority.
   * @scenario Change one selected map predicate in publication and authority, reseal, then inspect economics after structural acceptance.
   * @expected Invalid origin, counterpart and individual alias ownership cannot gain economic qualification.
   */
  it.each([
    'no native origin',
    'two native origins',
    'counterpart type',
    'counterpart residency',
    'same-set identifier',
    'same-set case alias',
    'cross-set case alias',
  ])('rejects isolated mapped policy fault %s', async (fault) => {
    const f = await setup();
    const packet = structuredClone(f.publication);
    const rawMap = JSON.parse(JSON.stringify(packet.rawTokenMap)) as Record<
      string,
      { tokenId: string; decimals: number; type?: string; residency?: string }
    >[];
    Reflect.set(packet, 'rawTokenMap', rawMap);
    const set = rawMap[1];
    if (fault === 'no native origin') set.avalanche.residency = 'wrapped';
    if (fault === 'two native origins') set.ergo.residency = 'native';
    if (fault === 'counterpart type') set.ergo.type = 'native';
    if (fault === 'counterpart residency') set.ergo.residency = 'invalid';
    if (fault === 'same-set identifier')
      set.other = { tokenId: set.ergo.tokenId, decimals: 9 };
    if (fault === 'same-set case alias')
      set.other = { tokenId: set.ergo.tokenId.toUpperCase(), decimals: 9 };
    if (fault === 'cross-set case alias')
      rawMap.push({
        other: { tokenId: set.ergo.tokenId.toUpperCase(), decimals: 9 },
      });
    const publication = reseal(packet);
    const policy = {
      ...f.policy,
      rawTokenMap: structuredClone(packet.rawTokenMap),
    };
    expect(
      inspectAvalancheFeeStructure(publication, policy.contract).feeOutputs,
    ).toHaveLength(2);
    expect(() =>
      inspectAvalancheFeeEconomics(publication, policy, f.observations),
    ).toThrow(/native origin|Ergo mapping|map alias/);
  });

  /**
   * @target inspectAvalancheFeeEconomics: refuses resealed canonical %s after structural acceptance
   * @dependencies Actual fee producer, canonical WASM transaction and independent frontend consumers with pinned dependency fixtures.
   * @scenario refuses resealed canonical %s after structural acceptance; vary only the declared case parameters against the shared producer fixture.
   * @expected refuses resealed canonical %s after structural acceptance. Invalid cases refuse the isolated fault; positive cases retain the declared exact transaction and publication checks.
   */
  it.each(['network fee', 'paired common'] as const)(
    'refuses resealed canonical %s after structural acceptance',
    async (fault) => {
      const f = await setup();
      expect(
        inspectAvalancheFeeEconomics(f.publication, f.policy, f.observations)
          .checkedUpdates,
      ).toHaveLength(2);
      const packet = replaceFeeOutput(f, (rows) => {
        const fee = rows.at(-1)!;
        if (fault === 'network fee') fee.configs.avalanche.networkFee++;
        else
          for (const config of Object.values(fee.configs) as {
            bridgeFee: bigint;
          }[])
            config.bridgeFee++;
      });
      // Also retag public candidate/plan to leave only the independent economic authority mismatch.
      const edited = structuredClone(packet);
      const asset = edited.feeEvidence.assets.find(
        (asset) => asset.selectedTokenId === 'avax',
      )!;
      const candidate = edited.feeEvidence.updates.find(
        (update) => update.selectedTokenId === 'avax',
      )!.candidate;
      if (fault === 'network fee') {
        Reflect.set(
          asset.fee,
          'networkFee',
          (BigInt(asset.fee.networkFee) + 1n).toString(),
        );
        Reflect.set(
          candidate.configs.avalanche,
          'networkFee',
          asset.fee.networkFee,
        );
      } else {
        Reflect.set(asset.fee, 'bridgeFee', '101');
        for (const config of Object.values(candidate.configs))
          Reflect.set(config, 'bridgeFee', '101');
      }
      const tampered = reseal(edited);
      expect(
        inspectAvalancheFeeStructure(tampered, f.policy.contract).feeOutputs,
      ).toHaveLength(2);
      expect(() =>
        inspectAvalancheFeeEconomics(tampered, f.policy, f.observations),
      ).toThrow('Invalid Avalanche economics: plan asset economics');
    },
  );

  /**
   * @target inspectAvalancheFeeEconomics: rejects canonical retained-history %s with independent original prior
   * @dependencies Actual fee producer, canonical WASM transaction and independent frontend consumers with pinned dependency fixtures.
   * @scenario rejects canonical retained-history %s with independent original prior; vary only the declared case parameters against the shared producer fixture.
   * @expected rejects canonical retained-history %s with independent original prior. Invalid cases refuse the isolated fault; positive cases retain the declared exact transaction and publication checks.
   */
  it.each(['delete', 'substitute'] as const)(
    'rejects canonical retained-history %s with independent original prior',
    async (fault) => {
      const f = await setup();
      const packet = replaceFeeOutput(f, (rows) => {
        if (fault === 'delete') rows.splice(0, 1);
        else rows[0].configs.avalanche.networkFee++;
      });
      expect(
        inspectAvalancheFeeStructure(packet, f.policy.contract).feeOutputs,
      ).toHaveLength(2);
      expect(() =>
        inspectAvalancheFeeEconomics(packet, f.policy, f.observations),
      ).toThrow('Invalid Avalanche economics: retained history');
    },
  );

  /**
   * @target inspectAvalancheFeeEconomics: matches actual pruning for %s
   * @dependencies Actual fee producer, canonical WASM transaction and independent frontend consumers with pinned dependency fixtures.
   * @scenario matches actual pruning for %s; vary only the declared case parameters against the shared producer fixture.
   * @expected matches actual pruning for %s. Invalid cases refuse the isolated fault; positive cases retain the declared exact transaction and publication checks.
   */
  it.each([
    'plain',
    'retained cardano',
    'avalanche equality',
    'legacy equality',
  ] as const)('matches actual pruning for %s', async (history) => {
    const f = await setup(43113, true, false, history);
    expect(
      inspectAvalancheFeeEconomics(f.publication, f.policy, f.observations)
        .checkedUpdates,
    ).toHaveLength(2);
    const report = inspectAvalancheFeeStructure(
      f.publication,
      f.policy.contract,
    );
    const fees = report.feeOutputs.find((box) => box.tokenId === native)!.fees;
    if (history === 'retained cardano') {
      expect(fees[0].configs).toHaveProperty('cardano');
      expect(fees.at(-1)!.heights.cardano).toBe(105);
      expect(fees.at(-1)!.configs).not.toHaveProperty('cardano');
    } else expect(fees.at(-1)!.heights).not.toHaveProperty('cardano');
    if (history === 'avalanche equality')
      expect(fees.some((fee) => fee.heights.avalanche === 100)).toBe(false);
    if (history === 'legacy equality')
      expect(
        fees.some(
          (fee) => fee.heights.avalanche === 100 && fee.heights.ergo === 100,
        ),
      ).toBe(true);
    // Equality at frontier-guarantee retains that row plus the first strictly old row.
    expect(fees[0].heights.avalanche).toBe(1);
    expect(fees[1].heights.avalanche).toBe(90);
  });

  /**
   * @target inspectAvalancheFeeEconomics: binds real consumed prior against %s
   * @dependencies Actual fee producer, canonical WASM transaction and independent frontend consumers with pinned dependency fixtures.
   * @scenario binds real consumed prior against %s; vary only the declared case parameters against the shared producer fixture.
   * @expected binds real consumed prior against %s. Invalid cases refuse the isolated fault; positive cases retain the declared exact transaction and publication checks.
   */
  it.each(['different prior identity', 'claimed absence'] as const)(
    'binds real consumed prior against %s',
    async (fault) => {
      const f = await setup();
      expect(
        inspectAvalancheFeeEconomics(f.publication, f.policy, f.observations)
          .checkedUpdates,
      ).toHaveLength(2);
      const changed = structuredClone(f.observations);
      if (fault === 'claimed absence')
        Reflect.set(changed.priorFeeBoxes, native, null);
      else {
        const w = deps.wasm;
        const box = w.ErgoBox.sigma_parse_bytes(
          Buffer.from(f.observations.priorFeeBoxes[native]!, 'base64'),
        );
        const json = box.to_js_eip12();
        json.transactionId = '56'.repeat(32);
        delete json.boxId;
        const other = w.ErgoBox.from_json(JSON.stringify(json));
        Reflect.set(
          changed.priorFeeBoxes,
          native,
          Buffer.from(other.sigma_serialize_bytes()).toString('base64'),
        );
      }
      expect(
        inspectAvalancheFeeStructure(f.publication, f.policy.contract)
          .feeInputs,
      ).toHaveLength(2);
      expect(() =>
        inspectAvalancheFeeEconomics(f.publication, f.policy, changed),
      ).toThrow('Invalid Avalanche economics: prior box authority');
    },
  );
});
