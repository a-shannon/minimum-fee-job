import { state as constructionState } from '../mocked/avalancheFeeConstruction.mock';
import { state } from '../mocked/avalancheFeeIntegration.mock';
import { state as publicationState } from '../mocked/avalancheFeePublication.mock';
import {
  native,
  address,
  integrationCases2,
  integrationCases3,
  integrationCases5,
  integrationCases6,
} from '../testData/avalancheFeeIntegration';
import { publicationCases15 } from '../testData/avalancheFeePublicationCases';
import {
  deps as constructionDeps,
  common as constructionCommon,
  heights as constructionHeights,
  setup as constructionSetup,
  registerConstructionContext,
} from '../testUtils/avalancheFeeConstructionContext';
import {
  deps,
  methods,
  setup,
  raw,
  source,
  heights,
  common,
  nativeSet,
  assetSet,
  registerIntegrationContext,
} from '../testUtils/avalancheFeeIntegration';
import {
  setup as publicationSetup,
  registerPublicationContext as publicationRegisterPublicationContext,
} from '../testUtils/avalancheFeePublication';

describe('beginAvalancheFeeGeneration', () => {
  describe('qualified HTTP generation', () => {
    registerIntegrationContext();

    /**
     * @target beginAvalancheFeeGeneration uses actual tokens5 full-map API without losing unbridgeable collisions
     * @dependencies Actual integration/newConfig/updateConfig/TokenHandler sources, pinned tokens5 and minimum-fee3.1.2, loopback RPC; injected config, legacy fee reads and box fetch.
     * @scenario Create a real tokens5 map containing an unbridgeable AVAX collision, capture its raw config through the generation source, then inspect the collision rejection before RPC.
     * @expected Preserves the unbridgeable raw-map row and rejects the global identifier collision before RPC.
     */
    it('uses actual tokens5 full-map API without losing unbridgeable collisions', async () => {
      const tokens = new deps.tokens.TokenMap(),
        rawMap = [
          { other: { tokenId: 'avax', decimals: 18 } },
          nativeSet(),
          assetSet(),
        ];
      await tokens.updateConfigByJson(rawMap);
      expect(tokens.getConfig()).toHaveLength(2);
      expect(tokens.getRawConfig()).toHaveLength(3);
      state.source = {
        ...source(),
        rawMap,
        currentRawMap: tokens.getRawConfig(),
      };
      const m = await import('../../src/minimum-fee/avalancheFeeIntegration');
      expect(() =>
        m.beginAvalancheFeeGeneration(() => state.source as never),
      ).toThrow();
      expect(methods).toHaveLength(0);
    });

    /**
     * @target beginAvalancheFeeGeneration captures nested config proxies without retaining owners and detects later changes
     * @dependencies Actual integration/newConfig/updateConfig/TokenHandler sources, pinned tokens5 and minimum-fee3.1.2, loopback RPC; injected config, legacy fee reads and box fetch.
     * @scenario Capture fee properties supplied by a nested Proxy, compare immutable captured owners, change only the original fee amount and recheck generation freshness.
     * @expected Owns a deeply frozen equal-value snapshot, retains the optional property and rejects later source drift.
     */
    it('captures nested config proxies without retaining owners and detects later changes', async () => {
      const original = source();
      const fee = { amount: 9007199254740993n, optional: undefined };
      original.tokens[0].fee = new Proxy(fee, {});
      state.source = new Proxy(original, {});
      const policy = raw();
      policy.margin = new Proxy(policy.margin, {});
      Object.defineProperty(policy.margin, 'configHelper', { value: () => 1 });
      state.raw = new Proxy(policy, {});
      const m = await import('../../src/minimum-fee/avalancheFeeIntegration');
      const generation = m.beginAvalancheFeeGeneration(
        () => state.source as never,
      )!;
      expect(generation.source.tokens[0].fee).toEqual(fee);
      expect(generation.source.tokens[0].fee).not.toBe(fee);
      expect(
        Object.hasOwn(generation.source.tokens[0].fee, 'optional'),
      ).toEqual(true);
      expect(Object.isFrozen(generation.source.tokens[0].fee)).toEqual(true);
      expect(Object.isFrozen(fee)).toEqual(false);
      generation.assertFresh();
      fee.amount += 1n;
      expect(() => generation.assertFresh()).toThrow('inputs changed');
      expect(methods).toHaveLength(0);
    });

    /**
     * @target beginAvalancheFeeGeneration refuses unsupported captured source %s before RPC
     * @dependencies Actual integration/newConfig/updateConfig/TokenHandler sources, pinned tokens5 and minimum-fee3.1.2, loopback RPC; injected config, legacy fee reads and box fetch.
     * @scenario Place each documented unsupported accessor, function, symbol, class, cycle or bound-exceeding shape in the source fee object; begin capture and inspect rejection without invoking the accessor or RPC.
     * @expected Rejects unsupported or excessive captured data without invoking the getter or issuing RPC.
     */
    it.each(integrationCases2)(
      'refuses unsupported captured source %s before RPC',
      async (fault) => {
        const data: Record<string, unknown> = {};
        const getter = vi.fn(() => 1);
        if (fault === 'accessor')
          Object.defineProperty(data, 'value', {
            enumerable: true,
            get: getter,
          });
        if (fault === 'function') data.value = () => 1;
        if (fault === 'symbol') data.value = Symbol('value');
        if (fault === 'class') data.value = new Date(0);
        if (fault === 'cycle') data.value = data;
        if (fault === 'depth') {
          let child = data;
          for (let i = 0; i < 65; i++) {
            const next = {};
            child.value = next;
            child = next;
          }
        }
        if (fault === 'array length') data.value = new Array(200001).fill(0);
        if (fault === 'nodes')
          data.value = [new Array(100000).fill(0), new Array(100000).fill(0)];
        const original = source();
        original.tokens[0].fee = data;
        state.source = original;
        const m = await import('../../src/minimum-fee/avalancheFeeIntegration');
        expect(() =>
          m.beginAvalancheFeeGeneration(() => state.source as never),
        ).toThrow(
          fault === 'nodes' || fault === 'depth'
            ? 'exceeds capture bounds'
            : 'Invalid Avalanche generation data',
        );
        expect(getter).not.toHaveBeenCalled();
        expect(methods).toHaveLength(0);
      },
    );

    /**
     * @target beginAvalancheFeeGeneration rejects %s before RPC
     * @dependencies Actual integration/newConfig/updateConfig/TokenHandler sources, pinned tokens5 and minimum-fee3.1.2, loopback RPC; injected config, legacy fee reads and box fetch.
     * @scenario Change only the documented price, guarantee, trigger, supported decimals, Ergo identity or identifier alias in a fresh source policy; begin capture and inspect rejection before RPC.
     * @expected Rejects malformed price, trigger, guarantee or token identity inputs before issuing RPC.
     */
    it.each(integrationCases5)('rejects %s before RPC', (fault) => {
      const p = state.raw as ReturnType<typeof raw>,
        s = state.source as ReturnType<typeof source>;
      if (fault === 'missing price') delete p.tokenPrices[address];
      if (fault === 'number price') Reflect.set(p.tokenPrices, address, 0.5);
      if (fault === 'missing gas price') Reflect.set(p, 'avaxPrice', undefined);
      if (fault === 'bad guarantee') p.feeGuaranteeBlocks = 0;
      if (fault === 'bad trigger') p.networkFeeTriggerPercent = '5e0';
      if (fault === 'wrong source decimals') s.tokens[1].decimals = 7;
      if (fault === 'wrong Ergo identity') s.tokens[1].ergoSideTokenId = native;
      if (fault === 'alias') s.tokens.push({ ...s.tokens[0], tokenId: native });
      return import('../../src/minimum-fee/avalancheFeeIntegration').then(
        (m) => {
          expect(() =>
            m.beginAvalancheFeeGeneration(() => state.source as never),
          ).toThrow();
          expect(methods).toHaveLength(0);
        },
      );
    });
  });
  describe('original publication authority', () => {
    publicationRegisterPublicationContext();
    const state = publicationState;
    const setup = publicationSetup;
    /**
     * @target beginAvalancheFeeGeneration disabled generation does not read optional publication inputs
     * @dependencies Actual generation/update/construction/publisher and pinned minimum-fee3/WASM; original injected runtime plan, supported-token and external box observations; actual decoder and KV SDK where called.
     * @scenario Prepare authentic state, disable Avalanche, pass throwing optional input readers to begin generation and inspect publication selection.
     * @expected Disabled capture does not call either reader or select the Avalanche publication path.
     */
    it('disabled generation does not read optional publication inputs', async () => {
      const f = await setup();
      state.raw = { enabled: false };
      const read = vi.fn(() => {
        throw new Error('must not read');
      });
      expect(f.api.beginAvalancheFeeGeneration(read, read)).toBeUndefined();
      expect(read).not.toHaveBeenCalled();
      expect(f.api.usesAvalancheFeePublication(new Map())).toEqual(false);
    });
    /**
     * @target beginAvalancheFeeGeneration rejects invalid original numeric price %s before RPC
     * @dependencies Actual generation/update/construction/publisher and pinned minimum-fee3/WASM; original injected runtime plan, supported-token and external box observations; actual decoder and KV SDK where called.
     * @scenario Prepare one valid source and replace only the captured legacy numeric price with each documented invalid scalar before calling begin generation.
     * @expected Invalid original numeric prices reject capture before a new generation can issue RPC.
     */
    it.each(publicationCases15)(
      'rejects invalid original numeric price %s before RPC',
      async (value) => {
        const f = await setup();
        state.legacyPrices.set('avax', value);
        expect(() =>
          f.api.beginAvalancheFeeGeneration(
            () => state.source as never,
            () => ({
              legacyNumericPrices: Array.from(state.legacyPrices),
              rsnTokenId: 'avax',
            }),
          ),
        ).toThrow('legacy numeric');
      },
    );
  });
});

describe('consumeAvalancheUpdatedConfigs', () => {
  registerIntegrationContext();

  /**
   * @target consumeAvalancheUpdatedConfigs handles disabled construction with %s prior evidence
   * @dependencies Actual integration/newConfig/updateConfig/TokenHandler sources, pinned tokens5 and minimum-fee3.1.2, loopback RPC; injected config, legacy fee reads and box fetch.
   * @scenario Disable Avalanche and supply each documented current/new/prior config condition; consume the updated map and inspect prior-read count and the permitted legacy or binding rejection.
   * @expected Accepts only absent legacy history; rejects Avalanche or malformed history with the asserted prior-read count.
   */
  it.each(integrationCases3)(
    'handles disabled construction with %s prior evidence',
    async (mode) => {
      state.raw = { enabled: false };
      const legacy = { heights: { ergo: 1 }, configs: { ergo: common() } };
      const avalanche = {
        heights: { avalanche: 1 },
        configs: { avalanche: common() },
      };
      const prior = vi.fn(() => {
        if (mode === 'absent' || mode === 'new avalanche')
          throw new Error('No prior box');
        if (mode === 'malformed prior') throw new Error('Malformed prior');
        return [avalanche];
      });
      const updated = new Map([
        [
          'legacy',
          {
            new: {
              getConfigs: () => [mode === 'new avalanche' ? avalanche : legacy],
            },
            current: {
              getBox: () =>
                mode === 'absent' || mode === 'new avalanche' ? undefined : {},
              getConfigs: prior,
            },
          },
        ],
      ]);
      const m = await import('../../src/minimum-fee/avalancheFeeIntegration');
      const consume = () => m.consumeAvalancheUpdatedConfigs(updated as never);
      if (mode === 'absent') expect(consume()).toBeUndefined();
      else
        expect(consume).toThrow(
          mode === 'malformed prior'
            ? 'Malformed prior'
            : 'construction binding',
        );
      expect(prior).toHaveBeenCalledTimes(
        mode === 'absent' || mode === 'new avalanche' ? 0 : 1,
      );
      expect(methods).toHaveLength(0);
    },
  );
});

describe('finishAvalancheFeeGeneration', () => {
  registerIntegrationContext();

  /**
   * @target finishAvalancheFeeGeneration appends all fees once from real HTTP and binds real3.1.2 candidates to the same frontier
   * @dependencies Actual integration/newConfig/updateConfig/TokenHandler sources, pinned tokens5 and minimum-fee3.1.2, loopback RPC; injected config, legacy fee reads and box fetch.
   * @scenario Begin generation using real loopback HTTP RPC and pinned fee candidates, finish once, inspect the shared frontier and frozen capture, then attempt reuse.
   * @expected Adds the exact native and asset fees to the shared finalized frontier; consumes only the bound batch once.
   */
  it('appends all fees once from real HTTP and binds real3.1.2 candidates to the same frontier', async () => {
    const { module, candidates, frontier } = await setup();
    expect(methods).toEqual([
      'eth_chainId',
      'eth_getBlockByNumber',
      'eth_chainId',
      'eth_baseFee',
      'eth_maxPriorityFeePerGas',
    ]);
    expect(
      candidates.get('avax')!.getConfig().configs.avalanche.networkFee,
    ).toEqual(33000000000n);
    expect(
      candidates.get(address)!.getConfig().configs.avalanche.networkFee,
    ).toEqual(132000000n);
    expect(frontier.get('avalanche')).toEqual(100);
    expect(
      module.consumeAvalancheFeeGeneration(candidates, frontier)?.height,
    ).toEqual(100);
    expect(() =>
      module.consumeAvalancheFeeGeneration(candidates, frontier),
    ).toThrow('consumed');
  });
});

describe('consumeAvalancheFeeGeneration', () => {
  registerIntegrationContext();

  /**
   * @target consumeAvalancheFeeGeneration rejects candidate %s drift before consumption
   * @dependencies Actual integration/newConfig/updateConfig/TokenHandler sources, pinned tokens5 and minimum-fee3.1.2, loopback RPC; injected config, legacy fee reads and box fetch.
   * @scenario Finish an authentic plan, apply only the documented candidate field mutation, then consume that plan and inspect freshness rejection.
   * @expected Rejects each detached or changed candidate, frontier, policy or source at consumption.
   */
  it.each(integrationCases6)(
    'rejects candidate %s drift before consumption',
    async (fault) => {
      const { module, candidates, frontier } = await setup();
      let supplied = frontier;
      if (fault === 'replacement')
        candidates.set(
          'avax',
          new deps.fees.MinimumFeeConfig(
            structuredClone(candidates.get('avax')!.getConfig()),
          ),
        );
      if (fault === 'fee')
        candidates.get('avax')!.getConfig().configs.ergo.bridgeFee = 999n;
      if (fault === 'height') frontier.set('avalanche', 101);
      if (fault === 'frontier map') supplied = new Map(frontier);
      if (fault === 'policy')
        (state.raw as ReturnType<typeof raw>).enabled = false;
      if (fault === 'source')
        (state.source as ReturnType<typeof source>).tokens[0].name = 'changed';
      if (fault === 'extra row')
        candidates.set('other', new deps.fees.MinimumFeeConfig());
      expect(() =>
        module.consumeAvalancheFeeGeneration(candidates, supplied),
      ).toThrow();
    },
  );

  /**
   * @target consumeAvalancheFeeGeneration keeps disabled optional fields inert and rejects residual/unbound Avalanche data
   * @dependencies Actual integration/newConfig/updateConfig/TokenHandler sources, pinned tokens5 and minimum-fee3.1.2, loopback RPC; injected config, legacy fee reads and box fetch.
   * @scenario Disable Avalanche with throwing optional field getters, inspect inert generation startup, then supply residual or unbound Avalanche data and inspect rejection.
   * @expected Leaves disabled optional getters unread and rejects residual or unbound Avalanche rows.
   */
  it('keeps disabled optional fields inert and rejects residual/unbound Avalanche data', async () => {
    state.raw = {
      enabled: false,
      get rpcUrl() {
        throw Error('read');
      },
      get tokenPrices() {
        throw Error('read');
      },
    };
    const m = await import('../../src/minimum-fee/avalancheFeeIntegration');
    expect(
      m.beginAvalancheFeeGeneration(() => {
        throw Error('source read');
      }),
    ).toBeUndefined();
    const candidate = new deps.fees.MinimumFeeConfig().setChainConfig(
      'avalanche',
      10,
      common(),
    );
    expect(() =>
      m.consumeAvalancheFeeGeneration(new Map([['x', candidate]]), heights()),
    ).toThrow();
    expect(() =>
      m.assertAvalancheFeeHistory(undefined, [candidate.getConfig()]),
    ).toThrow('history');
    expect(methods).toHaveLength(0);
  });

  /**
   * @target consumeAvalancheFeeGeneration rejects an older complete plan after another generation begins
   * @dependencies Actual integration/newConfig/updateConfig/TokenHandler sources, pinned tokens5 and minimum-fee3.1.2, loopback RPC; injected config, legacy fee reads and box fetch.
   * @scenario Finish an authentic plan, begin a newer generation, then attempt to consume the older candidates and frontier.
   * @expected Rejects consumption of the older completed plan as superseded.
   */
  it('rejects an older complete plan after another generation begins', async () => {
    const { module, candidates, frontier } = await setup();
    module.beginAvalancheFeeGeneration(() => state.source as never);
    expect(() =>
      module.consumeAvalancheFeeGeneration(candidates, frontier),
    ).toThrow('superseded');
  });
});

describe('avalancheFeeChangeRequired', () => {
  registerIntegrationContext();

  /**
   * @target avalancheFeeChangeRequired uses an exact strict directional fee threshold including a zero baseline
   * @dependencies Actual integration/newConfig/updateConfig/TokenHandler sources, pinned tokens5 and minimum-fee3.1.2, loopback RPC; injected config, legacy fee reads and box fetch.
   * @scenario Compare directional fee differences around the exact trigger including equality, below-threshold values and zero baseline.
   * @expected Changes fees only strictly beyond the exact directional threshold, including the zero-baseline branch.
   */
  it('uses an exact strict directional fee threshold including a zero baseline', async () => {
    const { module, candidates, frontier } = await setup(),
      binding = module.consumeAvalancheFeeGeneration(candidates, frontier),
      f = (n: bigint) => ({
        heights: { avalanche: 1 },
        configs: { avalanche: { ...common(), networkFee: n } },
      });
    expect(
      module.avalancheFeeChangeRequired(binding, f(100n), f(105n)),
    ).toEqual(false);
    expect(
      module.avalancheFeeChangeRequired(binding, f(100n), f(106n)),
    ).toEqual(true);
    expect(
      module.avalancheFeeChangeRequired(binding, f(105n), f(100n)),
    ).toEqual(false);
    expect(
      module.avalancheFeeChangeRequired(binding, f(106n), f(100n)),
    ).toEqual(true);
    expect(module.avalancheFeeChangeRequired(binding, f(0n), f(1n))).toEqual(
      true,
    );
  });
});

describe('cloneAvalancheCandidate', () => {
  registerConstructionContext();

  const setup = constructionSetup;

  /**
   * @target cloneAvalancheCandidate reconstructs candidate fields byte-for-byte before its explicit value replacement
   * @dependencies Real minimum-fee 3.1.2 models, updateConfig and construction sources, WASM and box selection; injected token/config readers, economic plan and Ergo network reads.
   * @scenario Generate an authentic updated fee candidate, serialize it, clone those bytes without a value replacement, and serialize the clone for exact comparison.
   * @expected Reconstructed candidate serialization matches every original byte.
   */
  it('reconstructs candidate fields byte-for-byte before its explicit value replacement', async () => {
    const { api, updated } = await setup();
    const bytes = api.avalancheCandidateBytes(updated.get('avax')!.new.build());
    expect(
      api.avalancheCandidateBytes(api.cloneAvalancheCandidate(bytes)),
    ).toEqual(bytes);
  });
});

describe('assertAvalancheFeeTransaction', () => {
  registerConstructionContext();

  const state = constructionState,
    setup = constructionSetup;

  /**
   * @target assertAvalancheFeeTransaction binds exact returned fields and refuses a detached copy or superseded authority
   * @dependencies Real minimum-fee 3.1.2 models, updateConfig and construction sources, WASM and box selection; injected token/config readers, economic plan and Ergo network reads.
   * @scenario Construct an authentic transaction, assert four detached copies including changed sender, reduced bytes and input order, then start a newer generation and recheck the original transaction.
   * @expected Rejects copied transaction fields and superseded transaction authority.
   */
  it('binds exact returned fields and refuses a detached copy or superseded authority', async () => {
    const { api, updated, updateConfigsTransaction } = await setup();
    const tx = await updateConfigsTransaction(updated);
    for (const copy of [
      { ...tx },
      { ...tx, sender: 'bad' },
      { ...tx, reducedTx: 'bad' },
      { ...tx, inputs: [...tx.inputs].reverse() },
    ])
      expect(() => api.assertAvalancheFeeTransaction(copy)).toThrow('Unbound');
    api.beginAvalancheFeeGeneration(() => state.source as never);
    expect(() => api.assertAvalancheFeeTransaction(tx)).toThrow('superseded');
  });
});

describe('bindAvalancheUpdatedConfigs', () => {
  registerConstructionContext();

  const state = constructionState,
    common = constructionCommon,
    heights = constructionHeights;

  let deps: typeof constructionDeps;

  beforeAll(() => {
    deps = constructionDeps;
  });

  /**
   * @target bindAvalancheUpdatedConfigs / consumeAvalancheUpdatedConfigs refuses a legitimately bound empty update map without network reads
   * @dependencies Real minimum-fee 3.1.2 models, updateConfig and construction sources, WASM and box selection; injected token/config readers, economic plan and Ergo network reads.
   * @scenario Finish and consume an authentic generation, bind an empty update map, attempt a second binding on a detached empty map, then consume the original empty update and inspect the network-read log.
   * @expected Rejects empty or rebound updates before network reads.
   */
  it('refuses a legitimately bound empty update map without network reads', async () => {
    const api = await import('../../src/minimum-fee/avalancheFeeIntegration');
    const generation = api.beginAvalancheFeeGeneration(
      () => state.source as never,
    );
    const candidates = new Map([
        [
          'avax',
          new deps.fees.MinimumFeeConfig().setChainConfig(
            'ergo',
            105,
            common(),
          ),
        ],
      ]),
      frontier = heights();
    await api.finishAvalancheFeeGeneration(generation, candidates, frontier);
    const binding = api.consumeAvalancheFeeGeneration(candidates, frontier);
    const updated = new Map();
    api.bindAvalancheUpdatedConfigs(binding, updated);
    expect(() => api.bindAvalancheUpdatedConfigs(binding, new Map())).toThrow(
      'Unbound',
    );
    expect(() => api.consumeAvalancheUpdatedConfigs(updated)).toThrow(
      'No Avalanche fee updates',
    );
    expect(state.calls).toEqual([]);
  });
});
